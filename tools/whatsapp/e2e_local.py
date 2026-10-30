"""E2E local: login -> cadastro -> aprovação (boas-vindas) -> bot -> alerta (template) -> aceite -> monitor.

Roda as 3 Lambdas reais (UniconectaApp, BOT, lambda_check) com DynamoDB/SSM em memória.
Só a Graph API é real, e só quando LIVE=1 — e ainda assim SOMENTE para TEST_TO / TEST_TO_2;
qualquer outro destino é suprimido (resposta 200 falsa) e apenas registrado.

    python3 tools/whatsapp/e2e_local.py          # usa LIVE do .env
    LIVE=0 python3 tools/whatsapp/e2e_local.py   # tudo mockado

Para mensagens livres (menu, confirmações) chegarem ao TEST_TO, ele precisa ter mandado
uma mensagem ao número da empresa nas últimas 24h (janela de atendimento da Meta).
"""
import os
import re
import sys
import json
import hmac
import time
import types
import base64
import hashlib
import importlib.util
import urllib.request
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from create_templates import load_env  # noqa: E402

ENV = load_env()
LIVE = ENV.get('LIVE', '0') == '1'
TOKEN = ENV.get('WA_ACCESS_TOKEN') or 'fake-token'
TEST_TO = re.sub(r'\D', '', ENV.get('TEST_TO', '')) or '5531900000099'
TEST_TO_2 = re.sub(r'\D', '', ENV.get('TEST_TO_2', ''))
ALLOWED_LIVE = {n for n in (TEST_TO, TEST_TO_2) if n} if LIVE else set()
FAKE_REQUESTER = TEST_TO_2 or '5531900000001'   # quem pede ajuda (suprimido se não for número de teste)
SUPERVISOR = '5531900000077'                    # fictício: usuário com is_supervisor no DBBot
APP_SECRET = 'e2e-app-secret'
VERIFY_TOKEN = 'e2e-verify-token'

# =====================================================================
#  Stubs: boto3 / botocore (DynamoDB e SSM em memória)
# =====================================================================

STORE = {}  # table_name -> {ID: item}


class ClientError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.response = {'Error': {'Code': code}}


class _KeyCond:
    def __init__(self, name):
        self.name = name

    def eq(self, value):
        return (self.name, value)


def _resolve(token, names, values):
    token = token.strip()
    if token.startswith(':'):
        return ('val', values[token])
    return ('attr', names.get(token, token))


def _eval(expr, item, names, values):
    """Avaliador mínimo para as expressões usadas pelas Lambdas (AND/OR, =, <>, >, attribute_(not_)exists)."""
    if not expr:
        return True
    for part in re.split(r'\s+OR\s+', expr):
        if all(_eval_atom(a, item, names, values) for a in re.split(r'\s+AND\s+', part)):
            return True
    return False


def _eval_atom(atom, item, names, values):
    atom = atom.strip()
    m = re.match(r'attribute_(not_)?exists\((.+)\)', atom)
    if m:
        attr = names.get(m.group(2).strip(), m.group(2).strip())
        return (attr not in item) if m.group(1) else (attr in item)
    m = re.match(r'(\S+)\s*(<>|=|>|<)\s*(\S+)', atom)
    left, op, right = m.groups()
    def val(tok):
        kind, v = _resolve(tok, names, values)
        return item.get(v) if kind == 'attr' else v
    lv, rv = val(left), val(right)
    if op == '=':
        return lv == rv
    if op == '<>':
        return lv != rv
    if lv is None or rv is None:
        return False
    return lv > rv if op == '>' else lv < rv


class FakeTable:
    def __init__(self, name):
        self.name = name
        self.rows = STORE.setdefault(name, {})

    def get_item(self, Key):
        item = self.rows.get(Key['ID'])
        return {'Item': dict(item)} if item else {}

    def put_item(self, Item):
        self.rows[Item['ID']] = dict(Item)
        return {}

    def delete_item(self, Key):
        self.rows.pop(Key['ID'], None)
        return {}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues=None,
                    ExpressionAttributeNames=None, ConditionExpression=None, ReturnValues=None):
        names, values = ExpressionAttributeNames or {}, ExpressionAttributeValues or {}
        item = self.rows.setdefault(Key['ID'], {'ID': Key['ID']})
        if ConditionExpression and not _eval(ConditionExpression, item, names, values):
            raise ClientError('ConditionalCheckFailedException')
        for assign in UpdateExpression.replace('SET ', '', 1).split(','):
            attr, val = [s.strip() for s in assign.split('=')]
            item[names.get(attr, attr)] = values[val]
        return {'Attributes': dict(item)} if ReturnValues else {}

    def query(self, IndexName, KeyConditionExpression, **_):
        attr, value = KeyConditionExpression
        return {'Items': [dict(i) for i in self.rows.values() if i.get(attr) == value]}

    def scan(self, FilterExpression=None, ExpressionAttributeNames=None, ExpressionAttributeValues=None, **_):
        names, values = ExpressionAttributeNames or {}, ExpressionAttributeValues or {}
        return {'Items': [dict(i) for i in self.rows.values() if _eval(FilterExpression, i, names, values)]}


class FakeResource:
    def Table(self, name):
        return FakeTable(name)


class FakeSSM:
    def get_parameter(self, Name, WithDecryption=False):
        return {'Parameter': {'Value': TOKEN}}


boto3 = types.ModuleType('boto3')
boto3.resource = lambda *a, **k: FakeResource()
boto3.client = lambda *a, **k: FakeSSM()
boto3_dynamodb = types.ModuleType('boto3.dynamodb')
boto3_conditions = types.ModuleType('boto3.dynamodb.conditions')
boto3_conditions.Key = _KeyCond
botocore = types.ModuleType('botocore')
botocore_exceptions = types.ModuleType('botocore.exceptions')
botocore_exceptions.ClientError = ClientError
sys.modules.update({'boto3': boto3, 'boto3.dynamodb': boto3_dynamodb, 'boto3.dynamodb.conditions': boto3_conditions,
                    'botocore': botocore, 'botocore.exceptions': botocore_exceptions})

# =====================================================================
#  Interceptação da Graph API
# =====================================================================

SENT = []  # {'to','type','template','live','status','response'}
_real_urlopen = urllib.request.urlopen


class _FakeResp:
    status = 200

    def __init__(self, body):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _fake_urlopen(req, *args, **kwargs):
    if 'graph.facebook.com' not in req.full_url:
        return _real_urlopen(req, *args, **kwargs)
    payload = json.loads(req.data.decode('utf-8'))
    rec = {'to': payload.get('to'), 'type': payload.get('type'),
           'template': payload.get('template', {}).get('name'), 'payload': payload, 'live': False}
    SENT.append(rec)
    if payload.get('to') in ALLOWED_LIVE:
        rec['live'] = True
        try:
            with _real_urlopen(req, *args, **kwargs) as resp:
                rec['status'], rec['response'] = resp.status, resp.read().decode('utf-8')
                return _FakeResp(rec['response'].encode())
        except urllib.error.HTTPError as e:
            rec['status'], rec['response'] = e.code, e.read().decode('utf-8')
            raise urllib.error.HTTPError(e.url, e.code, e.msg, e.hdrs, _BytesIO(rec['response'].encode()))
    rec['status'], rec['response'] = 200, '{"suppressed":true}'
    return _FakeResp(b'{"messages":[{"id":"wamid.FAKE"}]}')


class _BytesIO:
    def __init__(self, b):
        self.b = b

    def read(self, *a):
        return self.b

    def close(self):
        pass


urllib.request.urlopen = _fake_urlopen

# =====================================================================
#  Carregar as Lambdas
# =====================================================================

COMMON_ENV = {
    'AWS_DYNAMODB_TABLE_NAME_0': 'users', 'AWS_DYNAMODB_TABLE_NAME_1': 'requests',
    'AWS_SSM_PARAMETER_NAME_0': '/uniconecta/wa-token',
    'GRAPH_API_URL': ENV.get('GRAPH_API_URL', 'https://graph.facebook.com/v26.0'),
    'WA_PHONE_NUMBER_ID': ENV.get('WA_PHONE_NUMBER_ID', '1413979345131573'),
    'WA_VERIFY_TOKEN': VERIFY_TOKEN, 'WA_APP_SECRET': APP_SECRET,
}
ADMIN_EMAIL, ADMIN_PASSWORD = 'e2e@uniconecta.test', base64.urlsafe_b64encode(os.urandom(12)).decode()
_salt = os.urandom(16)
ADMIN_HASH = 'pbkdf2_sha256$100000${}${}'.format(
    base64.b64encode(_salt).decode(),
    base64.b64encode(hashlib.pbkdf2_hmac('sha256', ADMIN_PASSWORD.encode(), _salt, 100000)).decode())
os.environ.update(COMMON_ENV)
os.environ.update({'JWT_SECRET': 'e2e-jwt-secret', 'ADMIN_EMAIL': ADMIN_EMAIL, 'ADMIN_PASSWORD_HASH': ADMIN_HASH})


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


app = load('uniconecta_app', 'LambdaFiles/UniconectaApp/UniconectaApp.py')
bot = load('bot', 'LambdaFiles/BOT/BOT.py')
check = load('lambda_check', 'LambdaFiles/lambda_check/lambda_check.py')
USERS, REQS = STORE['users'], STORE['requests']

# =====================================================================
#  Helpers de teste
# =====================================================================

RESULTS = []


def ok(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ''))


def sent_since(mark):
    return SENT[mark:]


def api(method, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    event = {'httpMethod': method, 'path': '/behavior-dev' + path, 'headers': headers,
             'body': json.dumps(body) if body is not None else None}
    resp = app.lambda_handler(event, None)
    return resp['statusCode'], json.loads(resp['body'] or 'null')


_wamid = [0]


def webhook(from_num, text=None, button_id=None, template_payload=None, wamid=None, sign=True, statuses=None):
    if wamid is None:
        _wamid[0] += 1
        wamid = f"wamid.E2E{_wamid[0]}"
    value = {'messaging_product': 'whatsapp', 'metadata': {'phone_number_id': COMMON_ENV['WA_PHONE_NUMBER_ID']}}
    if statuses is not None:
        value['statuses'] = statuses
    else:
        msg = {'from': from_num, 'id': wamid, 'timestamp': str(int(time.time()))}
        if text is not None:
            msg.update(type='text', text={'body': text})
        elif button_id:
            msg.update(type='interactive', interactive={'type': 'button_reply', 'button_reply': {'id': button_id, 'title': 'x'}})
        elif template_payload:
            msg.update(type='button', button={'payload': template_payload, 'text': 'Aceitar'})
        value['contacts'] = [{'wa_id': from_num, 'profile': {'name': 'E2E'}}]
        value['messages'] = [msg]
    raw = json.dumps({'object': 'whatsapp_business_account', 'entry': [{'id': 'WABA', 'changes': [{'field': 'messages', 'value': value}]}]})
    sig = 'sha256=' + hmac.new(APP_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    event = {'httpMethod': 'POST', 'headers': {'X-Hub-Signature-256': sig if sign else 'sha256=bad'}, 'body': raw}
    return bot.lambda_handler(event, None)


def show(recs):
    return ', '.join(f"{r['type']}{'/' + r['template'] if r['template'] else ''}->{r['to']}"
                     f"{'(LIVE ' + str(r['status']) + ')' if r['live'] else ''}" for r in recs)


def live_ok(recs):
    """Em LIVE, todo envio real precisa ter voltado 2xx da Meta."""
    bad = [r for r in recs if r['live'] and not (200 <= int(r.get('status') or 0) < 300)]
    for r in bad:
        print(f"      Meta error -> {r['to']}: {r['response']}")
    return not bad

# =====================================================================
#  Cenário
# =====================================================================


def main():
    print(f"Mode: {'LIVE to ' + ', '.join(sorted(ALLOWED_LIVE)) if LIVE else 'MOCK (no real sends)'}")
    print(f"Volunteer under test (TEST_TO): {TEST_TO} | requester: {FAKE_REQUESTER}\n")

    print("1) Admin site API: login -> cadastro -> list -> approve (welcome template)")
    code, body = api('POST', '/auth/login', {'email': ADMIN_EMAIL, 'password': 'wrong'})
    ok('login with wrong password -> 401', code == 401)
    code, body = api('POST', '/auth/login', {'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD})
    jwt = (body or {}).get('token')
    ok('login -> 200 + JWT', code == 200 and jwt)
    code, _ = api('GET', '/recipients')
    ok('GET /recipients without token -> 401', code == 401)
    cadastro = {'nome_completo': 'Teste E2E', 'idade': 40, 'endereco': 'Rua A, 1', 'bairro': 'Centro',
                'whatsapp': TEST_TO[2:] if TEST_TO.startswith('55') else TEST_TO,
                'voluntario_ic': 'Sim', 'contato_familia': 'Ana 31 98888-7777', 'contato_ccci': 'CCCI'}
    code, body = api('POST', '/cadastro', cadastro)
    ok('POST /cadastro -> 201 pending', code == 201 and body.get('status') == 'pending', json.dumps(body))
    vid = body.get('id')
    ok('canonical ID equals TEST_TO', vid == TEST_TO, f"{vid} vs {TEST_TO}")
    code, body = api('GET', '/recipients', token=jwt)
    ok('GET /recipients -> lists the new cadastro', code == 200 and any(r['id'] == vid for r in body['recipients']))
    mark = len(SENT)
    code, body = api('PATCH', f'/recipients/{vid}', {'status': 'approved'}, token=jwt)
    recs = sent_since(mark)
    ok('PATCH approved -> 200', code == 200 and body.get('status') == 'approved')
    ok('welcome template sent to volunteer', any(r['template'] == 'boas_vindas_aprovado' and r['to'] == vid for r in recs), show(recs))
    ok('welcome accepted by Meta', live_ok(recs))
    mark = len(SENT)
    api('PATCH', f'/recipients/{vid}', {'status': 'approved'}, token=jwt)
    ok('re-approving does NOT resend welcome', not sent_since(mark))

    # Requester (approved) seeded directly — a second network member.
    USERS[FAKE_REQUESTER] = {'ID': FAKE_REQUESTER, 'status': 'approved', 'nome_completo': 'Solicitante E2E',
                             'nome_preferido': 'Sol', 'conversation_state': 'initial',
                             'state_last_updated': datetime.utcnow().isoformat()}

    print("\n2) Webhook security")
    resp = bot.lambda_handler({'httpMethod': 'GET', 'queryStringParameters': {
        'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345'}}, None)
    ok('GET verify with correct token -> challenge', resp['statusCode'] == 200 and resp['body'] == '12345')
    resp = bot.lambda_handler({'httpMethod': 'GET', 'queryStringParameters': {
        'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1'}}, None)
    ok('GET verify with wrong token -> 403', resp['statusCode'] == 403)
    mark = len(SENT)
    resp = webhook(TEST_TO, text='oi', sign=False)
    ok('POST with bad signature -> 401, nothing sent', resp['statusCode'] == 401 and not sent_since(mark))

    print("\n3) Volunteer opens the bot")
    mark = len(SENT)
    resp = webhook(TEST_TO, template_payload='open_menu', wamid='wamid.MENU1')
    recs = sent_since(mark)
    ok('"Abrir menu" (welcome button) -> interactive menu', resp['statusCode'] == 200 and any(r['type'] == 'interactive' and r['to'] == TEST_TO for r in recs), show(recs))
    menu = next((r['payload'] for r in recs if r['type'] == 'interactive'), {})
    btns = menu.get('interactive', {}).get('action', {}).get('buttons', [])
    ok('menu: ≤3 reply buttons, titles ≤20, body ≤1024',
       0 < len(btns) <= 3 and all(b['type'] == 'reply' and len(b['reply']['title']) <= 20 for b in btns)
       and len(menu['interactive']['body']['text']) <= 1024)
    ok('menu accepted by Meta', live_ok(recs))
    mark = len(SENT)
    webhook(TEST_TO, template_payload='open_menu', wamid='wamid.MENU1')
    ok('duplicate wamid -> ignored', not sent_since(mark))
    mark = len(SENT)
    webhook('5531911112222', text='oi')
    recs = sent_since(mark)
    ok('unregistered number -> "not registered" text', len(recs) == 1 and recs[0]['type'] == 'text', show(recs))
    mark = len(SENT)
    resp = webhook(None, statuses=[{'id': 'wamid.X', 'status': 'failed', 'recipient_id': TEST_TO,
                                    'errors': [{'code': 131047, 'title': 'Re-engagement message'}]}])
    ok('statuses payload -> 200, no reply', resp['statusCode'] == 200 and not sent_since(mark))

    print("\n4) Urgent help request -> network alert template")
    webhook(FAKE_REQUESTER, button_id='menu_emergency')
    webhook(FAKE_REQUESTER, button_id='emergency_type_seguranca')
    ok('requester state advanced', USERS[FAKE_REQUESTER]['conversation_state'] == 'awaiting_emergency_timing_seguranca',
       USERS[FAKE_REQUESTER]['conversation_state'])
    mark = len(SENT)
    webhook(FAKE_REQUESTER, button_id='emergency_timing_hoje')
    recs = sent_since(mark)
    req = next(iter(REQS.values()), None)
    ok('request created (pendente)', req and req['status'] == 'pendente', json.dumps(req, default=str) if req else '')
    alert = next((r for r in recs if r['template'] == 'alerta_rede_apoio' and r['to'] == TEST_TO), None)
    ok('alert template sent to network member', alert, show(recs))
    if alert:
        comps = alert['payload']['template']['components']
        params = [p['text'] for p in comps[0]['parameters']]
        payloads = [c['parameters'][0]['payload'] for c in comps[1:]]
        ok('alert has 4 params, no newlines', len(params) == 4 and not any('\n' in p for p in params), json.dumps(params, ensure_ascii=False))
        ok('alert buttons carry accept_/decline_ payloads', payloads == [f"accept_{req['ID']}", f"decline_{req['ID']}"], str(payloads))
    ok('requester gets confirmation text', any(r['to'] == FAKE_REQUESTER and r['type'] == 'text' for r in recs))
    ok('alert accepted by Meta', live_ok(recs))

    print("\n5) Volunteer taps \"Aceitar\" on the template")
    mark = len(SENT)
    webhook(TEST_TO, template_payload=f"accept_{req['ID']}")
    recs = sent_since(mark)
    ok('request -> aceito by volunteer', REQS[req['ID']]['status'] == 'aceito' and REQS[req['ID']]['accepter_id'] == TEST_TO)
    ok('requester notified', any(r['to'] == FAKE_REQUESTER for r in recs), show(recs))
    ok('accepter gets confirmation', any(r['to'] == TEST_TO for r in recs))
    ok('accept messages accepted by Meta', live_ok(recs))
    mark = len(SENT)
    webhook(TEST_TO, template_payload=f"accept_{req['ID']}")
    recs = sent_since(mark)
    ok('second accept -> "already accepted"', len(recs) == 1 and 'já foi aceita' in recs[0]['payload']['text']['body'])

    print("\n6) Monitor (lambda_check)")
    REQS[req['ID']]['acceptance_timestamp'] = (datetime.utcnow() - timedelta(minutes=15)).isoformat()
    USERS[TEST_TO].update(conversation_state='awaiting_ride_type',
                          state_last_updated=(datetime.utcnow() - timedelta(minutes=90)).isoformat())
    USERS[SUPERVISOR] = {'ID': SUPERVISOR, 'status': 'approved', 'is_supervisor': True, 'nome_completo': 'Supervisor E2E'}
    REQS['OLD-001'] = {'ID': 'OLD-001', 'status': 'pendente', 'requester_name': 'Antigo',
                       'creation_timestamp': (datetime.utcnow() - timedelta(minutes=70)).isoformat()}
    mark = len(SENT)
    resp = check.lambda_handler({}, None)
    recs = sent_since(mark)
    ok('monitor run -> 200', resp['statusCode'] == 200)
    ok('feedback sent to requester + flag cleared',
       any(r['to'] == FAKE_REQUESTER for r in recs) and REQS[req['ID']]['feedback_pending'] is False, show(recs))
    ok('stale conversation -> menu re-sent + reset',
       any(r['to'] == TEST_TO and r['type'] == 'interactive' for r in recs) and USERS[TEST_TO]['conversation_state'] == 'initial')
    ok('overdue request escalated to supervisor', REQS['OLD-001'].get('escalated') is True and any(r['to'] == SUPERVISOR for r in recs))
    ok('monitor messages accepted by Meta', live_ok(recs))

    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed. "
          f"Graph calls: {len(SENT)} ({sum(r['live'] for r in SENT)} live).")
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
