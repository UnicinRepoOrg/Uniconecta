"""Cria (ou consulta) os templates UTILITY do UniConecta na WABA via Graph API.

Uso:
    python3 tools/whatsapp/create_templates.py            # cria os que faltam e mostra o status
    python3 tools/whatsapp/create_templates.py --status   # só mostra o status
    python3 tools/whatsapp/create_templates.py --check    # valida token/número/webhook (somente leitura)

Lê tools/whatsapp/.env (veja .env.example). Somente stdlib.
"""
import os
import sys
import json
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env(path=os.path.join(HERE, '.env')):
    env = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env[key.strip()] = value.strip()
    env.update({k: v for k, v in os.environ.items() if k in env or k.startswith(('WA_', 'GRAPH_', 'TEST_', 'LIVE'))})
    return env


ENV = load_env()
GRAPH = ENV.get('GRAPH_API_URL', 'https://graph.facebook.com/v26.0').rstrip('/')
WABA_ID = ENV.get('WA_WABA_ID')
PHONE_ID = ENV.get('WA_PHONE_NUMBER_ID')
TOKEN = ENV.get('WA_ACCESS_TOKEN')

TEMPLATES = [
    {
        "name": "alerta_rede_apoio",
        "language": "pt_BR",
        "category": "UTILITY",
        "components": [
            {"type": "HEADER", "format": "TEXT", "text": "UniConecta CCCI"},
            {
                "type": "BODY",
                "text": ("Nova solicitação na Rede de Apoio UniConecta CCCI.\n\n"
                         "*{{1}}* precisa de apoio.\n"
                         "Tipo: {{2}}\n"
                         "Detalhes: {{3}}\n"
                         "Código: {{4}}\n\n"
                         "Você pode ajudar?"),
                "example": {"body_text": [["Maria (5531999999999)", "Carona p/ consulta",
                                           "Consulta amanhã às 10h no Hospital X", "ABC-123"]]},
            },
            {"type": "BUTTONS", "buttons": [
                {"type": "QUICK_REPLY", "text": "Aceitar"},
                {"type": "QUICK_REPLY", "text": "Indisponível"},
            ]},
        ],
    },
    {
        "name": "boas_vindas_aprovado",
        "language": "pt_BR",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": ("Olá, {{1}}! Seu cadastro na Rede de Apoio UniConecta CCCI foi aprovado pela "
                         "Comissão de Voluntariado. Toque em \"Abrir menu\" ou envie qualquer mensagem aqui "
                         "sempre que precisar de apoio."),
                "example": {"body_text": [["Maria"]]},
            },
            {"type": "BUTTONS", "buttons": [{"type": "QUICK_REPLY", "text": "Abrir menu"}]},
        ],
    },
]


def graph(method, path, body=None, params=None):
    url = f"{GRAPH}/{path}"
    if params:
        url += '?' + urllib.parse.urlencode(params)
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Authorization': f"Bearer {TOKEN}", 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, {}
    except Exception as e:  # timeout / rede: reporta em vez de quebrar
        return 0, {'error': f"{type(e).__name__}: {e}"}


def template_status(name):
    code, data = graph('GET', f"{WABA_ID}/message_templates",
                       params={'name': name, 'fields': 'name,status,category,language,rejected_reason'})
    rows = [t for t in data.get('data', []) if t.get('name') == name] if code == 200 else []
    return rows, (None if code == 200 else data)


def print_status():
    for t in TEMPLATES:
        rows, err = template_status(t['name'])
        if err:
            print(f"  {t['name']}: ERROR {json.dumps(err)}")
        elif not rows:
            print(f"  {t['name']}: (não existe)")
        for r in rows:
            extra = f" rejected_reason={r['rejected_reason']}" if r.get('rejected_reason') not in (None, 'NONE') else ''
            print(f"  {r['name']} [{r.get('language')}]: status={r.get('status')} category={r.get('category')}{extra}")


def create_missing():
    for t in TEMPLATES:
        rows, err = template_status(t['name'])
        if err:
            print(f"  {t['name']}: não foi possível consultar: {json.dumps(err)}")
            continue
        if any(r.get('language') == t['language'] for r in rows):
            print(f"  {t['name']}: já existe, pulando.")
            continue
        code, data = graph('POST', f"{WABA_ID}/message_templates", body=t)
        print(f"  {t['name']}: POST -> {code} {json.dumps(data)}")


def check():
    """Somente leitura: token válido, número, e se o app está inscrito na WABA (webhook)."""
    code, data = graph('GET', PHONE_ID, params={
        'fields': 'display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type,status'})
    print(f"  phone {PHONE_ID}: {code} {json.dumps(data, ensure_ascii=False)}")
    code, data = graph('GET', f"{WABA_ID}/subscribed_apps")
    print(f"  WABA subscribed_apps: {code} {json.dumps(data, ensure_ascii=False)}")
    code, data = graph('GET', WABA_ID, params={'fields': 'name,currency,account_review_status,message_template_namespace'})
    print(f"  WABA {WABA_ID}: {code} {json.dumps(data, ensure_ascii=False)}")


if __name__ == '__main__':
    if not all([WABA_ID, PHONE_ID, TOKEN]):
        sys.exit("Preencha WA_WABA_ID, WA_PHONE_NUMBER_ID e WA_ACCESS_TOKEN em tools/whatsapp/.env")
    if '--check' in sys.argv:
        check()
    elif '--status' in sys.argv:
        print_status()
    else:
        create_missing()
        print("Status:")
        print_status()
