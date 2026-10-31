import boto3
import xray_lite  # subsegmentos do X-Ray; precisa vir antes de qualquer boto3.client/resource
import os
import re
import json
import gzip
import logging
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from botocore.exceptions import ClientError

# --- Logger Configuration ---
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Environment Variable Configurations ---
# Aceita as duas convenções de nome (com e sem TARGET) para casar com a infra.
DYNAMODB_USERS_TABLE_NAME = os.environ.get('AWS_DYNAMODB_TABLE_NAME_0') or os.environ.get('AWS_DYNAMODB_TABLE_TARGET_NAME_0')
DYNAMODB_REQUESTS_TABLE_NAME = os.environ.get('AWS_DYNAMODB_TABLE_NAME_1') or os.environ.get('AWS_DYNAMODB_TABLE_TARGET_NAME_1')
AWS_REGION = os.environ.get('REGION', 'us-east-1')
PARAM_NAME_TOKEN = os.environ.get('AWS_SSM_PARAMETER_NAME_0') or os.getenv("AWS_SSM_PARAMETER_TARGET_NAME_0")
# WhatsApp Business Cloud API (Meta)
GRAPH_API_URL = os.environ.get('GRAPH_API_URL', 'https://graph.facebook.com/v26.0').rstrip('/')
WA_PHONE_NUMBER_ID = os.environ.get('WA_PHONE_NUMBER_ID')
WA_TEMPLATE_ALERT = os.environ.get('WA_TEMPLATE_ALERT', 'alerta_rede_apoio')
WA_TEMPLATE_LANG = os.environ.get('WA_TEMPLATE_LANG', 'pt_BR')
# Intervalo entre as ondas do envio por proximidade (o BOT grava next_wave_at com o mesmo valor).
# O agendamento deste monitor precisa rodar a cada 5 min ou menos para respeitar o intervalo.
WAVE_INTERVAL_MIN = int(os.environ.get('WAVE_INTERVAL_MIN', '15'))
# Envios simultâneos à Graph API ao avisar uma onda ou os supervisores (ver send_many).
SEND_CONCURRENCY = int(os.environ.get('SEND_CONCURRENCY', '10'))
# Arquivo diário dos pedidos no S3 (ligação lambda_check -> bucket, sem label). O TTL da
# SolicitacoesAtivas apaga cada pedido 3 dias depois de criado; antes disso, a primeira
# execução depois de ARCHIVE_HOUR (horário de Brasília) grava os pedidos de ontem num
# único arquivo. Sem o bucket, o arquivamento não roda e o resto do monitor segue.
ARCHIVE_BUCKET = os.environ.get('AWS_S3_BUCKET_NAME_0')
ARCHIVE_PREFIX = os.environ.get('ARCHIVE_PREFIX', 'pedidos').strip('/')
ARCHIVE_HOUR = int(os.environ.get('ARCHIVE_HOUR', '3'))
# Brasília sem horário de verão desde 2019. Offset fixo: o runtime da Lambda pode não ter tzdata.
LOCAL_TZ = timezone(timedelta(hours=-3))


# --- Mensagens ---
# Enviada ~10-15 min após o aceite (não junto do atendimento). Mantida idêntica ao
# texto em chatbot_act.py (MESSAGES['feedback_prompt']).
FEEDBACK_PROMPT = (
    "A sua opinião é muito importante para nós! Estamos sempre em busca de evoluir a usabilidade e a experiência da Rede UniConecta CCCI.\n\n"
    "Se quiser contribuir com sugestões, críticas construtivas ou melhorias, envie um e-mail para: uniconecta@unicin.org\n\n"
    "A Rede de apoio UniConecta CCCI é construída por todos nós. \n"
    "Contamos com você para torná-la cada vez mais funcional, acolhedora e interassistencial!"
)

# Atraso mínimo antes de enviar o feedback após o aceite.
FEEDBACK_DELAY_MINUTES = 10

# --- Validações e Clientes Boto3 ---
if not all([DYNAMODB_USERS_TABLE_NAME, DYNAMODB_REQUESTS_TABLE_NAME, PARAM_NAME_TOKEN, WA_PHONE_NUMBER_ID]):
    logger.error("CRITICAL ERROR: Essential environment variables not configured.")
    raise ValueError("Incomplete environment configuration.")

ssm = boto3.client("ssm", region_name=AWS_REGION)
dynamodb_resource = boto3.resource("dynamodb", region_name=AWS_REGION)
users_table = dynamodb_resource.Table(DYNAMODB_USERS_TABLE_NAME)
requests_table = dynamodb_resource.Table(DYNAMODB_REQUESTS_TABLE_NAME)
s3 = boto3.client("s3", region_name=AWS_REGION)

# --- Carregar Token do SSM Parameter Store ---
try:
    response = ssm.get_parameter(Name=PARAM_NAME_TOKEN, WithDecryption=True)
    TOKEN = response["Parameter"]["Value"]
except Exception as e:
    logger.error(f"CRITICAL ERROR loading token from SSM: {e}")
    raise e

# --- Funções de Comunicação (WhatsApp Cloud API) ---

def _to(num):
    """Destino no formato da Cloud API: só dígitos (aceita JIDs legados '...@s.whatsapp.net')."""
    return re.sub(r'\D', '', str(num or '').split('@')[0])

def _send_wa(payload):
    headers = {'Authorization': f"Bearer {TOKEN}", 'Content-Type': 'application/json'}
    payload = {'messaging_product': 'whatsapp', 'recipient_type': 'individual', **payload}
    data_bytes = json.dumps(payload).encode('utf-8')
    url = f"{GRAPH_API_URL}/{WA_PHONE_NUMBER_ID}/messages"
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')
    try:
        with xray_lite.urlopen(req, timeout=10) as response:
            if 200 <= response.status < 300: return True
            logger.error(f"Error sending message. Status: {response.status}, Body: {response.read().decode()}")
            return False
    except urllib.error.HTTPError as e:
        logger.error(f"HTTP Error {e.code} sending to {payload.get('to')} - Meta Response: {e.read().decode('utf-8')}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error in _send_wa: {e}")
        return False

def send_text(to, body):
    return _send_wa({'to': _to(to), 'type': 'text', 'text': {'body': body, 'preview_url': True}})

def send_main_menu_with_buttons(to):
    menu_body = (
        "Olá! Parece que sua sessão anterior expirou. Vamos começar de novo.\n\n"
        "Selecione uma das opções abaixo 👇:"
    )
    buttons = [("menu_emergency", "🚨 Ajuda Imediata"), ("menu_ride", "🚗 Carona Solidária"), ("menu_chat", "💬 Bate-papo")]
    interactive = {"type": "button", "header": {"type": "text", "text": "UniConecta CCCI"}, "body": {"text": menu_body},
                   "action": {"buttons": [{"type": "reply", "reply": {"id": bid, "title": title}} for bid, title in buttons]}}
    return _send_wa({"to": _to(to), "type": "interactive", "interactive": interactive})

# Mesmos helpers de template do BOT (BOT.py): o alerta precisa chegar fora da janela de 24h.
def _tpl_param(value, limit=500):
    """Parâmetro de template: a Meta rejeita quebras de linha, tabs e >4 espaços seguidos."""
    text = re.sub(r'\s*\n\s*', ' | ', str(value or '-'))
    text = re.sub(r'[\t ]+', ' ', text).strip() or '-'
    return text[:limit]

def send_template(to, name, body_params, button_payloads=None):
    components = [{"type": "body",
                   "parameters": [{"type": "text", "text": _tpl_param(p)} for p in body_params]}]
    for i, payload in enumerate(button_payloads or []):
        components.append({"type": "button", "sub_type": "quick_reply", "index": str(i),
                           "parameters": [{"type": "payload", "payload": payload}]})
    return _send_wa({"to": _to(to), "type": "template",
                     "template": {"name": name, "language": {"code": WA_TEMPLATE_LANG}, "components": components}})

def send_alert_template(to, requester_label, alert_label, details, request_id):
    return send_template(to, WA_TEMPLATE_ALERT,
                         [requester_label, alert_label, details, request_id],
                         [f"accept_{request_id}", f"decline_{request_id}"])

def send_many(send, targets):
    """Chama send(target) para cada destino, até SEND_CONCURRENCY ao mesmo tempo, e devolve
    quantos a Meta aceitou. Cada chamada à Graph API leva centenas de ms; em sequência, uma
    rede de 400 pessoas passava de 2 minutos. A Meta aceita 80 mensagens/s por número."""
    targets = list(targets)
    if len(targets) <= 1:
        return sum(1 for t in targets if send(t))
    with ThreadPoolExecutor(max_workers=min(SEND_CONCURRENCY, len(targets))) as pool:
        return sum(1 for ok in pool.map(send, targets) if ok)

# --- FUNÇÃO send_nps_survey REMOVIDA ---


# --- Lógica Principal do Monitor ---

def scan_all(table, **kwargs):
    """Itens de um Scan, página a página: cada chamada lê no máximo 1 MB da tabela."""
    while True:
        response = table.scan(**kwargs)
        yield from response.get('Items', [])
        if 'LastEvaluatedKey' not in response:
            return
        kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']


def get_supervisor_targets():
    """Supervisores vêm da tabela de usuários: is_supervisor = true e cadastro aprovado.
    Devolve o wa_jid (número real de onde a pessoa fala) ou o ID."""
    targets, kwargs = [], {
        'FilterExpression': 'is_supervisor = :t AND #st = :approved',
        'ExpressionAttributeNames': {'#st': 'status'},
        'ExpressionAttributeValues': {':t': True, ':approved': 'approved'},
    }
    try:
        while True:
            response = users_table.scan(**kwargs)
            targets += [it.get('wa_jid') or it['ID'] for it in response.get('Items', [])]
            if 'LastEvaluatedKey' not in response:
                break
            kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
    except Exception as e:
        logger.error(f"Error querying supervisors: {e}")
    return targets


def escalate_to_supervisors(request_id, message):
    supervisors = get_supervisor_targets()
    if not supervisors:
        logger.error("No supervisor in the users table (is_supervisor = true, status = approved): overdue request not escalated to anyone.")
    send_many(lambda supervisor_num: send_text(supervisor_num, message), supervisors)
    requests_table.update_item(Key={'ID': request_id}, UpdateExpression='SET escalated = :val', ExpressionAttributeValues={':val': True})


def handle_pending_requests(now, start_time_iso):
    """(1) Notificar supervisores sobre solicitações pendentes há mais de 1 hora (criadas nas últimas 2h).
    Só para pedidos enviados à rede toda de uma vez; os em ondas são tratados em handle_wave_expansion."""
    logger.info("Checking for overdue pending requests...")
    one_hour_ago = now - timedelta(hours=1)
    
    items = scan_all(
        requests_table,
        FilterExpression='attribute_not_exists(escalated) AND attribute_not_exists(waves) AND #st = :status AND creation_timestamp > :start_time',
        ExpressionAttributeNames={'#st': 'status'},
        ExpressionAttributeValues={
            ':status': 'pendente',
            ':start_time': start_time_iso
        }
    )

    for item in items:
        timestamp_str = item.get('creation_timestamp')
        if not timestamp_str:
            logger.warning(f"Skipping request {item.get('ID', 'N/A')} because it is missing 'creation_timestamp'.")
            continue

        creation_timestamp = datetime.fromisoformat(timestamp_str).replace(tzinfo=timezone.utc)
        if creation_timestamp < one_hour_ago:
            logger.warning(f"Request {item['ID']} is overdue. Escalating to supervisors.")
            requester_name = item.get('requester_name', 'N/A')
            message = f"ALERTA SUPERVISOR: A solicitação de ajuda de *{requester_name}* (ID: {item['ID']}) está pendente há mais de 1 hora e não foi atendida."
            escalate_to_supervisors(item['ID'], message)


def _utc(timestamp_str):
    return datetime.fromisoformat(timestamp_str).replace(tzinfo=timezone.utc)


def send_next_wave(item, now):
    """Envia a próxima onda de um pedido ainda pendente. O update condicional em
    waves_sent garante que duas execuções sobrepostas não mandem a mesma onda."""
    request_id, waves = item['ID'], item.get('waves') or []
    sent, wave, remaining = int(item.get('waves_sent', 1)), waves[0], waves[1:]
    updates = 'SET waves = :rest, waves_sent = :next, next_wave_at = :at, contact_list = list_append(contact_list, :ids)'
    values = {':rest': remaining, ':next': sent + 1, ':cur': sent, ':pendente': 'pendente',
              ':at': (now + timedelta(minutes=WAVE_INTERVAL_MIN)).replace(tzinfo=None).isoformat(),
              ':ids': [r['id'] for r in wave]}
    if not remaining:
        updates += ', all_notified_at = :now'
        values[':now'] = now.replace(tzinfo=None).isoformat()
    try:
        requests_table.update_item(Key={'ID': request_id}, UpdateExpression=updates,
                                   ConditionExpression='#st = :pendente AND waves_sent = :cur',
                                   ExpressionAttributeNames={'#st': 'status'}, ExpressionAttributeValues=values)
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            logger.info(f"Request {request_id}: accepted or wave already sent by another run; skipping.")
            return
        raise

    requester_label = f"{item.get('requester_name', 'N/A')} ({item.get('requester_id', '')})"
    alert_label = item.get('alert_label') or item.get('request_type', '')
    success_count = send_many(
        lambda r: send_alert_template(str(r['to']).strip(), requester_label, alert_label,
                                      item.get('request_details', ''), request_id),
        wave)
    logger.info(f"Request {request_id}: wave {sent + 1} delivered to Meta for {success_count}/{len(wave)} members"
                f"{' (whole network notified)' if not remaining else ''}.")


def handle_wave_expansion(now):
    """(2) Envio em ondas: a cada WAVE_INTERVAL_MIN amplia um pedido pendente para a
    próxima onda (mais longe), até a rede toda; WAVE_INTERVAL_MIN depois disso, supervisor."""
    logger.info("Checking for pending requests to expand...")
    kwargs = {
        'FilterExpression': 'attribute_exists(waves) AND attribute_not_exists(escalated) AND #st = :status',
        'ExpressionAttributeNames': {'#st': 'status'},
        'ExpressionAttributeValues': {':status': 'pendente'},
    }
    while True:
        response = requests_table.scan(**kwargs)
        for item in response.get('Items', []):
            try:
                if item.get('waves'):
                    if item.get('next_wave_at') and _utc(item['next_wave_at']) <= now:
                        send_next_wave(item, now)
                elif item.get('all_notified_at'):
                    notified_at = _utc(item['all_notified_at'])
                    if notified_at <= now - timedelta(minutes=WAVE_INTERVAL_MIN):
                        minutes = int((now - notified_at).total_seconds() // 60)
                        logger.warning(f"Request {item['ID']} unanswered after the whole network. Escalating to supervisors.")
                        message = (f"ALERTA SUPERVISOR: A solicitação de ajuda de *{item.get('requester_name', 'N/A')}* "
                                   f"(ID: {item['ID']}) foi enviada para toda a rede há {minutes} min e não foi atendida.")
                        escalate_to_supervisors(item['ID'], message)
            except Exception as e:
                logger.error(f"Error expanding request {item.get('ID', 'N/A')}: {e}", exc_info=True)
        if 'LastEvaluatedKey' not in response:
            break
        kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']

# --- FUNÇÃO handle_accepted_requests REMOVIDA ---

def handle_stale_conversations(now, start_time_iso):
    """(3) Reiniciar o fluxo para usuários parados por mais de 1 hora (com estado atualizado nas últimas 2h)."""
    logger.info("Checking for stale conversations...")
    one_hour_ago = now - timedelta(hours=1)
    
    items = scan_all(
        users_table,
        FilterExpression='conversation_state <> :initial AND state_last_updated > :start_time',
        ExpressionAttributeValues={
            ':initial': 'initial',
            ':start_time': start_time_iso
        }
    )

    for item in items:
        timestamp_str = item.get('state_last_updated')
        if not timestamp_str:
            logger.warning(f"Skipping user {item.get('ID', 'N/A')} because 'state_last_updated' is missing unexpectedly.")
            continue
            
        last_updated = datetime.fromisoformat(timestamp_str).replace(tzinfo=timezone.utc)
        if last_updated < one_hour_ago:
            user_id = item['ID']
            user_id_wa = item.get('wa_jid') or user_id  # número real de onde a pessoa fala
            logger.warning(f"User {user_id} has a stale conversation state ({item['conversation_state']}). Resetting.")
            
            if send_main_menu_with_buttons(user_id_wa):
                users_table.update_item(Key={'ID': user_id}, UpdateExpression='SET conversation_state = :state', ExpressionAttributeValues={':state': 'initial'})


def handle_pending_feedback(now):
    """(4) Enviar a mensagem de feedback ~10-15 min após o aceite (não junto do
    atendimento). O bot marca feedback_pending=True e acceptance_timestamp ao aceitar."""
    logger.info("Checking for pending feedback messages...")
    cutoff = now - timedelta(minutes=FEEDBACK_DELAY_MINUTES)

    items = scan_all(
        requests_table,
        FilterExpression='#st = :status AND feedback_pending = :true',
        ExpressionAttributeNames={'#st': 'status'},
        ExpressionAttributeValues={':status': 'aceito', ':true': True}
    )

    for item in items:
        timestamp_str = item.get('acceptance_timestamp')
        if not timestamp_str:
            logger.warning(f"Skipping request {item.get('ID', 'N/A')} for feedback: missing 'acceptance_timestamp'.")
            continue

        accepted_at = datetime.fromisoformat(timestamp_str).replace(tzinfo=timezone.utc)
        if accepted_at > cutoff:
            continue  # aceite recente demais; envia numa próxima execução do monitor

        target = item.get('requester_wa') or item.get('requester_id')
        if not target:
            logger.warning(f"Skipping request {item['ID']} for feedback: no requester target.")
            continue

        logger.info(f"Sending delayed feedback for request {item['ID']} to {target}.")
        if send_text(f"{target}@s.whatsapp.net", FEEDBACK_PROMPT):
            requests_table.update_item(
                Key={'ID': item['ID']},
                UpdateExpression='SET feedback_pending = :false',
                ExpressionAttributeValues={':false': False}
            )


def archive_key(day):
    """Um arquivo por dia de criação; a pasta dt= é a partição de data que o Athena lê."""
    return f"{ARCHIVE_PREFIX}/dt={day.isoformat()}/pedidos.json.gz"


def is_archived(day):
    try:
        s3.head_object(Bucket=ARCHIVE_BUCKET, Key=archive_key(day))
        return True
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') in ('404', 'NoSuchKey', 'NotFound'):
            return False
        raise


def _json_default(value):
    """Tipos que o DynamoDB devolve e o json não conhece: número vira Decimal, conjunto vira set."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value, key=str)
    raise TypeError(f"Unexpected type {type(value).__name__} in a request item")


def write_archive(day, items):
    """JSON Lines com gzip: um pedido por linha, como está na tabela. Regravar o mesmo dia
    substitui o arquivo, então uma execução repetida não duplica pedidos."""
    items = sorted(items, key=lambda it: (it.get('creation_timestamp', ''), it.get('ID', '')))
    lines = ''.join(json.dumps(it, ensure_ascii=False, sort_keys=True, default=_json_default) + '\n' for it in items)
    s3.put_object(Bucket=ARCHIVE_BUCKET, Key=archive_key(day), Body=gzip.compress(lines.encode('utf-8')),
                  ContentType='application/x-ndjson')
    logger.info(f"Archived {len(items)} requests of {day} to s3://{ARCHIVE_BUCKET}/{archive_key(day)}.")


def handle_daily_archive(now):
    """(5) Grava no S3 os pedidos de cada dia antes de o TTL apagá-los. Roda na primeira
    execução depois de ARCHIVE_HOUR em que o arquivo de ontem ainda não existe; se falhar,
    a execução seguinte tenta de novo. Também grava qualquer dia anterior ainda presente na
    tabela e sem arquivo, o que cobre a primeira execução e os dias de uma falha longa."""
    if not ARCHIVE_BUCKET:
        logger.warning("AWS_S3_BUCKET_NAME_0 not set: daily request archive skipped.")
        return
    local_now = now.astimezone(LOCAL_TZ)
    if local_now.hour < ARCHIVE_HOUR:
        return
    yesterday = local_now.date() - timedelta(days=1)
    if is_archived(yesterday):
        return

    logger.info(f"Archiving requests created up to {yesterday} (Brasília time)...")
    by_day = defaultdict(list)
    for item in scan_all(requests_table):
        timestamp_str = item.get('creation_timestamp')
        if not timestamp_str:
            logger.warning(f"Request {item.get('ID', 'N/A')} has no 'creation_timestamp': left out of the archive.")
            continue
        day = _utc(timestamp_str).astimezone(LOCAL_TZ).date()
        if day <= yesterday:
            by_day[day].append(item)

    for day in sorted(by_day):
        if day != yesterday and is_archived(day):
            continue
        write_archive(day, by_day[day])
    if yesterday not in by_day:
        write_archive(yesterday, [])  # dia sem pedidos: o arquivo vazio encerra a busca do dia


# --- Handler Principal da Lambda ---

@xray_lite.traced
def lambda_handler(event, context):
    logger.info(f"Monitor function triggered at: {datetime.utcnow()}")
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    
    # Calcular o ponto de início para o filtro (2 horas atrás)
    two_hours_ago = now - timedelta(hours=2)
    two_hours_ago_iso = two_hours_ago.isoformat()
    
    try:
        # Passar o novo tempo de início para as funções
        handle_pending_requests(now, two_hours_ago_iso)

        handle_wave_expansion(now)
        
        # --- CHAMADA para handle_accepted_requests REMOVIDA ---
        
        handle_stale_conversations(now, two_hours_ago_iso)

        handle_pending_feedback(now)

        # Por último e à parte: uma falha no S3 não pode atrasar nem impedir os avisos acima.
        try:
            handle_daily_archive(now)
        except Exception as e:
            logger.error(f"ARCHIVE FAILED: daily request archive not written, next run retries: {e}", exc_info=True)

        logger.info("Monitor run completed successfully.")
        return {'statusCode': 200, 'body': json.dumps('Monitor run completed.')}
        
    except Exception as e:
        logger.error(f"Critical Error during monitor execution: {e}", exc_info=True)
        return {'statusCode': 500, 'body': json.dumps('Internal Server Error')}