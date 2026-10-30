import boto3
import xray_lite  # subsegmentos do X-Ray; precisa vir antes de qualquer boto3.client/resource
import os
import re
import json
import hmac
import base64
import hashlib
import logging
import urllib.request
import time
import random
import string
from datetime import datetime, timedelta
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
import dispatch

# --- Logger Configuration ---
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Environment Variable Configurations ---
# Aceita as duas convenções de nome (com e sem TARGET) para casar com a infra.
DYNAMODB_USERS_TABLE_NAME = os.environ.get('AWS_DYNAMODB_TABLE_NAME_0') or os.environ.get('AWS_DYNAMODB_TABLE_TARGET_NAME_0')
DYNAMODB_REQUESTS_TABLE_NAME = os.environ.get('AWS_DYNAMODB_TABLE_NAME_1') or os.environ.get('AWS_DYNAMODB_TABLE_TARGET_NAME_1')
AWS_REGION = os.environ.get('REGION', 'us-east-1')
PARAM_NAME_TOKEN = os.environ.get('AWS_SSM_PARAMETER_NAME_0') or os.getenv("AWS_SSM_PARAMETER_TARGET_NAME_0")
STATUS_INDEX = os.environ.get('STATUS_INDEX_NAME', 'StatusIndex')

# --- WhatsApp Business Cloud API (Meta) ---
GRAPH_API_URL = os.environ.get('GRAPH_API_URL', 'https://graph.facebook.com/v26.0').rstrip('/')
WA_PHONE_NUMBER_ID = os.environ.get('WA_PHONE_NUMBER_ID')
WA_VERIFY_TOKEN = os.environ.get('WA_VERIFY_TOKEN')        # verificação do webhook (GET hub.challenge)
WA_APP_SECRET = os.environ.get('WA_APP_SECRET')            # opcional: valida X-Hub-Signature-256
WA_TEMPLATE_ALERT = os.environ.get('WA_TEMPLATE_ALERT', 'alerta_rede_apoio')
WA_TEMPLATE_LANG = os.environ.get('WA_TEMPLATE_LANG', 'pt_BR')

# --- Envio em ondas por proximidade (ver dispatch.py) ---
# waves: avisa primeiro quem mora mais perto; o lambda_check amplia a cada WAVE_INTERVAL_MIN.
# broadcast: comportamento antigo (rede toda de uma vez), para rollback sem deploy.
DISPATCH_MODE = os.environ.get('DISPATCH_MODE', 'broadcast').strip().lower()
WAVE_INTERVAL_MIN = int(os.environ.get('WAVE_INTERVAL_MIN', '15'))
MIN_ONDA = int(os.environ.get('MIN_ONDA', '3'))

# --- Initial Validations ---
if not DYNAMODB_USERS_TABLE_NAME or not DYNAMODB_REQUESTS_TABLE_NAME or not PARAM_NAME_TOKEN or not WA_PHONE_NUMBER_ID:
    logger.error("CRITICAL ERROR: Essential environment variables not configured.")
    raise ValueError("Incomplete environment configuration.")

# A Chave secreta do app é hex (32 caracteres); só dígitos é o App ID, e aí toda mensagem da Meta cai em 401.
if WA_APP_SECRET and WA_APP_SECRET.isdigit():
    logger.error("WA_APP_SECRET looks like the App ID, not the App Secret: every Meta webhook will be rejected (401).")

# --- Boto3 Clients and Token ---
ssm = boto3.client("ssm", region_name=AWS_REGION)
dynamodb_resource = boto3.resource("dynamodb", region_name=AWS_REGION)
users_table = dynamodb_resource.Table(DYNAMODB_USERS_TABLE_NAME)
requests_table = dynamodb_resource.Table(DYNAMODB_REQUESTS_TABLE_NAME)

# --- Load Token from SSM Parameter Store ---
try:
    response = ssm.get_parameter(Name=PARAM_NAME_TOKEN, WithDecryption=True)
    TOKEN = response["Parameter"]["Value"]
    logger.info("Token loaded successfully from SSM Parameter Store.")
except Exception as e:
    logger.error(f"CRITICAL ERROR loading token from SSM: {e}")
    raise e

# --- Centralized Messages ---
MESSAGES = {
    'menu_body': (
        "Olá, voluntário(a)! Tudo bem?\n"
        "Seja bem-vindo(a) à Rede de Apoio aos Voluntários da CCCI!\n\n"
        "A partir de agora, você pode contar com este canal simples, seguro e acessível para solicitar apoio sempre que precisar. Estamos com você!\n\n"
        "Tem dúvidas sobre como funciona?\n"
        "Assista ao vídeo explicativo:\n"
        "👉 https://www.youtube.com/watch?v=1RDTkwXRtDQ\n\n"
        "📘 Quer entender melhor como usar?\n"
        "Clique aqui para baixar o Manual de Usabilidade:\n"
        "👉 https://drive.google.com/file/d/1ESrx_r2kdJ1zygNscEKeVmUilJAe4ry9/view?usp=drive_link \n\n"
        "Agora é só escolher uma das opções abaixo 👇:"
    ),
    'emergency_confirmation': "Sua solicitação foi enviada aos voluntários mais próximos. \nSe ninguém entrar em contato rapidamente, por favor acione alguém de confiança que esteja por perto ou ligue para o 192 imediatamente. \nSua segurança é prioridade.",
    'erro_envio_notificacao': "Sua solicitação foi recebida, mas não foi possível notificar um ou mais contatos.",
    'erro_usuario_nao_encontrado': "Você não está registrado no nosso sistema. Não é possível continuar.",
    'cadastro_em_analise': "Seu cadastro foi recebido e está em análise pela Comissão de Voluntariado. Assim que for aprovado, você poderá usar este canal. Obrigado pela paciência!",
    'erro_sem_contato_emergencia': "Ação não realizada. Você não possui uma lista de contatos cadastrada.",
    'pergunta_batepapo': (
        "Opa. Que bom que você nos procurou.\n"
        "Conte com a rede de apoio pra trocar ideias, desabafar ou simplesmente conversar. Podemos verificar agora quem está disponível pra falar com você, tudo bem?\n\n"
        "Pra gente combinar certinho, quando e onde você gostaria de conversar? Assim já vemos quem pode estar disponível."
    ),
    'manual_usabilidade': """*Manual de Usabilidade - UniConecta CCCI*...""",
    'solicitacao_aceita_para_solicitante': "Boas notícias! *{accepter_name}* aceitou sua solicitação.\nPara falar com ele(a), clique no link: {accepter_link}",
    'confirmacao_aceite_para_aceitante': "Obrigado! Você aceitou a solicitação de *{requester_name}*.\nPara falar com ele(a), clique no link: {requester_link}",
    'confirmacao_recusa_para_recusante': "Ok, solicitação recusada. Agradecemos o seu tempo.",
    'erro_solicitacao_nao_encontrada': "Ops! Não encontramos uma solicitação ativa com este código.",
    'erro_solicitacao_ja_aceita': "Esta solicitação já foi aceita por outra pessoa.",
    'notificacao_outros_contatos': "A solicitação de ajuda de *{requester_name}* já foi atendida.",
    'emergency_new_type_prompt': "Selecione a opção com o tipo de ajuda que precisa:",
    'emergency_new_timing_prompt': "Para quando você precisa dessa ajuda?",
    'emergency_intro': "Olá! Sou o canal da UniConecta CCCI, sua rede de apoio entre voluntários.\nVamos entender sua necessidade para acionar o suporte certo.",
    'emergency_type_1_confirm': "Entendido! Vamos agir o mais rápido possível, tá bem?\nMantenha a calma...",
    'emergency_type_2_confirm': "Entendi! Estamos aqui com você.\nMantenha a calma...",
    'ride_intro': "Legal, vamos tentar organizar isso rapidinho pra você!\nMe diz uma coisa:\nVocê precisa de carona para:",
    'ride_ask_details_medical': "Beleza! Conte com nossa rede de voluntários!\n Mas me diga qual é o dia e horário da sua consulta ou saída? e onde é?",
    'ride_ask_details_pharmacy': "Beleza! Conte com nossa rede de voluntários!\n Mas me diga Qual é o dia e horário?  E qual seria o endereço?",
    'ride_ask_details_other_step1': "Beleza! Conta pra gente com o que você precisa de apoio. Vamos ver como podemos ajudar!",
    'ride_ask_details_other_step2': "Claro! Vamos acionar a rede. Me diz qual dia você prefere e a gente vê quem pode te acompanhar.",
    'ride_confirm_other_final': "Tudo certo! Um voluntário da nossa rede de apoio vai falar com você no privado pra combinar direitinho! (não precisa responder essa mensagem)",
    'ride_confirm_medical': "Pronto, sua solicitação foi enviada aos voluntários mais próximos! \n Normalmente, alguém retorna em até 30 min a 1 hora. \nSe não houver resposta nesse período, procure ajuda de alguém conhecido ou alguém mais próximo de você.",
    'ride_confirm_generic': "Pronto, sua solicitação foi enviada aos voluntários mais próximos! \n Normalmente, alguém retorna em até 30 min a 1 hora. \nSe não houver resposta nesse período, procure ajuda de alguém conhecido ou alguém mais próximo de você.",
    'pergunta_cep': (
        "Antes de continuar: qual é o CEP da sua casa? 🏠\n"
        "Com ele avisamos primeiro os voluntários que moram mais perto quando você ou alguém da rede precisar de ajuda.\n\n"
        "Responda só com os números (ex.: 00000-000) ou escreva *pular*."
    ),
    'cep_invalido': "Não reconheci esse CEP. Ele tem 8 números (ex.: 00000-000). Tente de novo ou escreva *pular*.",
    'cep_salvo': "Obrigado! CEP salvo. 🙌",
    'feedback_prompt': (
        "A sua opinião é muito importante para nós! Estamos sempre em busca de evoluir a usabilidade e a experiência da Rede UniConecta CCCI.\n\n"
        "Se quiser contribuir com sugestões, críticas construtivas ou melhorias, envie um e-mail para: uniconecta@unicin.org\n\n"
        "A Rede de apoio UniConecta CCCI é construída por todos nós. \n"
        "Contamos com você para torná-la cada vez mais funcional, acolhedora e interassistencial!"
    ),
}

# --- Auxiliary Functions ---

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
            if 200 <= response.status < 300:
                return True
            logger.error(f"Error sending message. Status: {response.status}, Body: {response.read().decode()}")
            return False
    except urllib.error.HTTPError as e:
        # Lê o JSON de erro da Meta (error.code / error.message / error_data.details)
        error_body = e.read().decode('utf-8')
        logger.error(f"HTTP Error {e.code}: {e.reason} - Payload Sent: {json.dumps(payload)} - Meta Response: {error_body}")
        return False
    except urllib.error.URLError as e:
        logger.error(f"Connection error: {e.reason}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return False

def send_text(to, body):
    return _send_wa({'to': _to(to), 'type': 'text', 'text': {'body': body, 'preview_url': True}})

def send_interactive_message(to, msg_type, body_text, action_dict, header_text=None, footer_text=None):
    interactive = {"type": msg_type, "body": {"text": body_text}, "action": action_dict}
    if header_text:
        interactive["header"] = {"type": "text", "text": header_text}
    if footer_text:
        interactive["footer"] = {"text": footer_text}
    return _send_wa({"to": _to(to), "type": "interactive", "interactive": interactive})

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

def _buttons(*pairs):
    return {"buttons": [{"type": "reply", "reply": {"id": bid, "title": title}} for bid, title in pairs]}

def send_main_menu_with_buttons(to):
    action = _buttons(("menu_emergency", "🚨 Ajuda Urgente"),
                      ("menu_ride", "🚗 Carona Solidária"),
                      ("menu_chat", "💬 Bate-papo"))
    return send_interactive_message(to, "button", MESSAGES['menu_body'], action, header_text="UniConecta CCCI")

def send_alert_template(to, requester_label, alert_label, details, request_id):
    """Alerta para a rede: template UTILITY (entregue mesmo fora da janela de 24h).
    Os payloads dos botões mantêm os IDs accept_/decline_ que o roteador já trata."""
    return send_template(to, WA_TEMPLATE_ALERT,
                         [requester_label, alert_label, details, request_id],
                         [f"accept_{request_id}", f"decline_{request_id}"])

def send_emergency_type_buttons(to):
    # Títulos com no máximo 20 caracteres (limite do WhatsApp)
    action = _buttons(("emergency_type_seguranca", "Saúde ou Segurança"),
                      ("emergency_type_emocional", "Apoio Emocional"),
                      ("emergency_type_atividade", "Atividades/Evento"))
    return send_interactive_message(to, "button", MESSAGES['emergency_new_type_prompt'], action)

def send_emergency_timing_buttons(to):
    # Títulos com no máximo 20 caracteres (limite do WhatsApp)
    action = _buttons(("emergency_timing_hoje", "Hoje (Urgente)"),
                      ("emergency_timing_24h", "Nas próximas 24h"),
                      ("emergency_timing_semana", "Dentro da semana"))
    return send_interactive_message(to, "button", MESSAGES['emergency_new_timing_prompt'], action)

def send_ride_type_buttons(to):
    action = _buttons(("ride_type_medical", "1- Consulta Médica"),
                      ("ride_type_pharmacy", "2- Farmácia"),
                      ("ride_type_other", "3- Outro lugar"))
    return send_interactive_message(to, "button", MESSAGES['ride_intro'], action)


def phone_variants(num):
    """Gera variantes BR com/sem o 9 após o DDD (o WhatsApp costuma entregar
    o JID sem o 9). Ex.: '553190000000' <-> '5531990000000'."""
    digits = re.sub(r'\D', '', str(num or ''))
    variants = [digits]
    if digits.startswith('55') and len(digits) >= 12:
        ddd, rest = digits[2:4], digits[4:]
        if len(rest) == 8:                       # sem 9 -> adiciona
            variants.append(f"55{ddd}9{rest}")
        elif len(rest) == 9 and rest[0] == '9':  # com 9 -> remove
            variants.append(f"55{ddd}{rest[1:]}")
    return variants


def find_user(raw_clean):
    """Procura o usuário tolerando o 9º dígito. Devolve (item, stored_id)."""
    for cand in phone_variants(raw_clean):
        try:
            item = users_table.get_item(Key={'ID': cand}).get('Item')
        except Exception as e:
            logger.error(f"Error fetching user '{cand}': {e}")
            item = None
        if item:
            return item, cand
    return None, raw_clean


def get_user_info(user_id):
    item, _ = find_user(user_id)
    return item


def display_name(user_info):
    """Nome usado nas solicitações e atendimentos: o nome preferido, se informado;
    senão o nome completo (fallback final para um rótulo genérico)."""
    if not user_info:
        return 'Voluntário(a)'
    return (user_info.get('nome_preferido')
            or user_info.get('nome_completo')
            or 'Voluntário(a)')


def get_approved_members(exclude_id=None):
    """Rede aprovada via Query no GSI (sem Scan). Retorna dicts com 'id', 'to'
    (wa_jid real, se conhecido, ou o próprio id — para entrega correta) e
    'cep'/'bairro' (para o envio em ondas por proximidade)."""
    members, kwargs = [], {'IndexName': STATUS_INDEX,
                           'KeyConditionExpression': Key('status').eq('approved')}
    try:
        while True:
            response = users_table.query(**kwargs)
            for it in response.get('Items', []):
                uid = it.get('ID')
                if uid and uid != exclude_id:
                    members.append({'id': uid, 'to': it.get('wa_jid') or uid,
                                    'cep': it.get('cep'), 'bairro': it.get('bairro')})
            if 'LastEvaluatedKey' not in response:
                break
            kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
    except Exception as e:
        logger.error(f"Error querying approved users: {e}")
    return members

def update_user_data(user_id, state, wa_jid=None):
    try:
        expr = 'SET conversation_state = :state, state_last_updated = :ts'
        values = {':state': state, ':ts': datetime.utcnow().isoformat()}
        if wa_jid:
            expr += ', wa_jid = :wa'
            values[':wa'] = wa_jid
        users_table.update_item(Key={'ID': user_id}, UpdateExpression=expr,
                                ExpressionAttributeValues=values)
        logger.info(f"User data for '{user_id}' updated. New state: '{state}'.")
    except Exception as e:
        logger.error(f"Error updating data for user '{user_id}': {e}")


def save_user_fields(user_id, **fields):
    try:
        names = {f"#f{i}": k for i, k in enumerate(fields)}
        values = {f":v{i}": v for i, v in enumerate(fields.values())}
        users_table.update_item(Key={'ID': user_id},
                                UpdateExpression='SET ' + ', '.join(f"#f{i} = :v{i}" for i in range(len(fields))),
                                ExpressionAttributeNames=names, ExpressionAttributeValues=values)
    except Exception as e:
        logger.error(f"Error saving {list(fields)} for user '{user_id}': {e}")


def send_menu_or_ask_cep(sender_id, user_id, user_info):
    """Menu principal. Antes, pergunta o CEP uma única vez a quem ainda não tem
    (o CEP define quem é avisado primeiro no envio em ondas)."""
    if not user_info.get('cep') and not user_info.get('cep_asked'):
        save_user_fields(user_id, cep_asked=True)
        send_text(sender_id, MESSAGES['pergunta_cep'])
        update_user_data(user_id, 'awaiting_cep')
        return
    send_main_menu_with_buttons(sender_id)
    update_user_data(user_id, 'initial')


def send_target(user_id):
    """JID real de envio: o wa_jid (número exato de onde a pessoa fala) se
    conhecido; senão o próprio ID. Resolve a inconsistência do 9º dígito no envio."""
    if not user_id:
        return user_id
    try:
        item = users_table.get_item(Key={'ID': user_id}).get('Item')
        if item and item.get('wa_jid'):
            return item['wa_jid']
    except Exception as e:
        logger.error(f"Error resolving send target for '{user_id}': {e}")
    return user_id


# --- Request and Acceptance Flow Functions ---

def generate_request_id():
    return f"{''.join(random.choices(string.ascii_uppercase, k=3))}-{''.join(random.choices(string.digits, k=3))}"

def create_and_notify_request(sender_id, user_info, request_type, alert_label, user_input="", confirmation_message_key='ride_confirm_generic'):
    # Usa o ID canônico armazenado (resolve o 9º dígito), não o JID recebido.
    user_id_clean = user_info.get('ID') or sender_id.replace('@s.whatsapp.net', '').replace('@c.us', '')
    requester_wa = re.sub(r'\D', '', sender_id.split('@')[0]) or user_id_clean  # JID real de quem pediu
    user_name = display_name(user_info)  # nome preferido (fallback: nome completo)
    # Rede aprovada (menos o solicitante), não só a lista de contatos.
    network = get_approved_members(exclude_id=user_id_clean)
    if not network:
        send_text(sender_id, MESSAGES['erro_sem_contato_emergencia'])
        update_user_data(user_id_clean, 'initial')
        return

    # Em modo waves, a 1ª onda vai para os mais próximos (CEP/bairro) e o lambda_check
    # amplia o resto. Urgência vai para a rede toda de uma vez.
    use_waves = DISPATCH_MODE == 'waves'
    waves = dispatch.build_waves(user_info, network, min_size=MIN_ONDA,
                                 broadcast=not use_waves or request_type.startswith('emergency_'))
    first_wave, pending_waves = waves[0], waves[1:]

    contact_list = [r['id'] for r in first_wave]  # IDs canônicos de quem foi avisado (matching do aceite)
    request_id = generate_request_id()
    now = datetime.utcnow()
    item = {
        'ID': request_id, 'requester_id': user_id_clean, 'requester_name': user_name,
        'requester_wa': requester_wa, 'contact_list': contact_list, 'status': 'pendente',
        'creation_timestamp': now.isoformat(), 'request_type': request_type,
        'request_details': user_input, 'ttl': int(time.time()) + 86400
    }
    if use_waves:
        # O lambda_check lê estes campos: envia a próxima onda em next_wave_at e, com a
        # rede toda avisada (waves vazio), escala ao supervisor WAVE_INTERVAL_MIN depois.
        item.update({'alert_label': alert_label, 'waves': pending_waves, 'waves_sent': 1,
                     'next_wave_at': (now + timedelta(minutes=WAVE_INTERVAL_MIN)).isoformat()})
        if not pending_waves:
            item['all_notified_at'] = now.isoformat()
    try:
        requests_table.put_item(Item=item)
    except Exception as e:
        logger.error(f"Error creating request in DynamoDB: {e}")
        send_text(sender_id, "An internal error occurred while creating your request.")
        update_user_data(user_id_clean, 'initial')
        return

    requester_label = f"{user_name} ({user_id_clean})"
    # Envia o alerta (template) para o número real de cada membro da 1ª onda.
    success_count = sum(1 for r in first_wave
                        if send_alert_template(str(r['to']).strip(), requester_label, alert_label, user_input, request_id))
    logger.info(f"Request {request_id}: wave 1/{len(waves)} delivered to Meta for "
                f"{success_count}/{len(first_wave)} members (network: {len(network)}).")
    send_text(sender_id, MESSAGES[confirmation_message_key] if success_count > 0 else MESSAGES['erro_envio_notificacao'])
    update_user_data(user_id_clean, 'initial')

def handle_acceptance(accepter_id, request_id):
    accepter_id_clean = accepter_id.replace('@s.whatsapp.net', '').replace('@c.us', '')
    try:
        response = requests_table.get_item(Key={'ID': request_id})
        request_item = response.get('Item')
    except Exception as e: 
        logger.error(f"Error fetching request {request_id}: {e}")
        return

    if not request_item or request_item.get('status') != 'pendente':
        send_text(accepter_id, MESSAGES['erro_solicitacao_nao_encontrada' if not request_item else 'erro_solicitacao_ja_aceita'])
        return

    accepter_info, accepter_id_clean = find_user(accepter_id_clean)  # resolve 9º dígito
    accepter_name = display_name(accepter_info) if accepter_info else 'Um contato'

    try:
        # Condicional: dois aceites ao mesmo tempo -> só o primeiro vence.
        requests_table.update_item(
            Key={'ID': request_id},
            UpdateExpression='SET #st = :status, accepter_id = :accepter, acceptance_timestamp = :ts, accepter_name = :aname, feedback_pending = :fp',
            ConditionExpression='#st = :pendente',
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={
                ':status': 'aceito', ':accepter': accepter_id_clean,
                ':ts': datetime.utcnow().isoformat(), ':aname': accepter_name,
                ':fp': True,  # feedback enviado depois pelo monitor (~10-15 min), não junto do aceite
                ':pendente': 'pendente'
            }
        )
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            send_text(accepter_id, MESSAGES['erro_solicitacao_ja_aceita'])
        else:
            logger.error(f"Error updating status for request {request_id}: {e}")
        return
    except Exception as e:
        logger.error(f"Error updating status for request {request_id}: {e}")
        return

    requester_id = request_item['requester_id']
    # Envia para o JID REAL do solicitante (resolve o 9º dígito no envio).
    requester_target = request_item.get('requester_wa') or requester_id
    requester_id_wa = requester_target
    accepter_link = f"https://wa.me/{accepter_id_clean}"
    requester_link = f"https://wa.me/{requester_id}"

    # Envia confirmação para o solicitante
    send_text(requester_id_wa, MESSAGES['solicitacao_aceita_para_solicitante'].format(accepter_name=accepter_name, accepter_link=accepter_link))

    # A mensagem de feedback NÃO é enviada aqui: o monitor (chatbot_check.py) a envia
    # ~10-15 min depois, para não competir com o atendimento (feedback_pending=True acima).

    # Envia confirmação para quem aceitou (JID real do clique)
    send_text(accepter_id, MESSAGES['confirmacao_aceite_para_aceitante'].format(requester_name=request_item['requester_name'], requester_link=requester_link))

    # Notifica os outros contatos (no JID real de cada um)
    for contact_num in request_item.get('contact_list', []):
        cid = str(contact_num).strip()
        if cid not in [accepter_id_clean, requester_id]:
            send_text(send_target(cid), MESSAGES['notificacao_outros_contatos'].format(requester_name=request_item['requester_name']))

# --- Main Lambda Handler ---

def _http_method(event):
    return (event.get('httpMethod')
            or event.get('requestContext', {}).get('http', {}).get('method') or 'POST')


def _raw_body(event):
    raw = event.get('body') or ''
    if event.get('isBase64Encoded') and isinstance(raw, str):
        raw = base64.b64decode(raw).decode('utf-8')
    return raw


def _plain(status_code, text):
    return {'statusCode': status_code, 'headers': {'Content-Type': 'text/plain'}, 'body': text}


def handle_verification(event):
    """GET do webhook: a Meta envia hub.mode/hub.verify_token/hub.challenge."""
    params = event.get('queryStringParameters') or {}
    if params.get('hub.mode') == 'subscribe' and WA_VERIFY_TOKEN and params.get('hub.verify_token') == WA_VERIFY_TOKEN:
        return _plain(200, params.get('hub.challenge', ''))
    logger.warning("Webhook verification failed (mode/token mismatch).")
    return _plain(403, 'Forbidden')


def valid_signature(event, raw):
    """X-Hub-Signature-256 = HMAC-SHA256(app secret, corpo bruto). Ignorado se WA_APP_SECRET não estiver definido."""
    if not WA_APP_SECRET:
        return True
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    received = headers.get('x-hub-signature-256', '')
    expected = 'sha256=' + hmac.new(WA_APP_SECRET.encode(), raw.encode('utf-8'), hashlib.sha256).hexdigest()
    return hmac.compare_digest(received, expected)


def iter_incoming(body):
    """Achata o payload da Meta (entry[].changes[].value) em mensagens; loga statuses com falha."""
    for entry in body.get('entry', []):
        for change in entry.get('changes', []):
            value = change.get('value', {})
            for st in value.get('statuses', []):
                if st.get('status') == 'failed':
                    logger.error(f"Delivery FAILED to {st.get('recipient_id')} (wamid {st.get('id')}): {json.dumps(st.get('errors'))}")
            for message in value.get('messages', []):
                yield message


def message_action_id(message):
    """ID do botão clicado: interactive (button/list reply) ou quick reply de template (button.payload)."""
    interactive = message.get('interactive', {})
    return (interactive.get('button_reply', {}).get('id')
            or interactive.get('list_reply', {}).get('id')
            or message.get('button', {}).get('payload'))


def already_processed(user_id, wamid):
    """A Meta pode reentregar o mesmo webhook: grava o último wamid e ignora repetidos."""
    if not wamid:
        return False
    try:
        users_table.update_item(Key={'ID': user_id},
            UpdateExpression='SET last_wamid = :w',
            ConditionExpression='attribute_not_exists(last_wamid) OR last_wamid <> :w',
            ExpressionAttributeValues={':w': wamid})
        return False
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'ConditionalCheckFailedException':
            return True
        logger.error(f"Error recording wamid for '{user_id}': {e}")
        return False
    except Exception as e:
        logger.error(f"Error recording wamid for '{user_id}': {e}")
        return False


@xray_lite.traced
def lambda_handler(event, context):
    try:
        if _http_method(event) == 'GET':
            return handle_verification(event)

        if isinstance(event.get('body'), str):
            raw = _raw_body(event)
            if not valid_signature(event, raw):
                logger.error("Invalid X-Hub-Signature-256; request rejected. Check WA_APP_SECRET (App Secret, not the App ID).")
                return _plain(401, 'Invalid signature')
            body = json.loads(raw or '{}')
        else:
            body = event
        logger.info(f"Received body: {json.dumps(body)}")

        for message in iter_incoming(body):
            sender_id = message.get('from', '')
            user_id_clean = sender_id
            incoming_jid = re.sub(r'\D', '', str(sender_id))  # número real de onde veio a msg

            text_input = message.get('text', {}).get('body', '').strip()
            action_id = message_action_id(message)

            if action_id: logger.info(f"Received ACTION_ID: '{action_id}'")
            if text_input: logger.info(f"Received TEXT_INPUT: '{text_input}'")

            # --- Authenticated User Flow (tolerante ao 9º dígito) ---
            user_info, user_id_clean = find_user(user_id_clean)
            if not user_info:
                send_text(sender_id, MESSAGES['erro_usuario_nao_encontrado'])
                continue

            if already_processed(user_id_clean, message.get('id')):
                logger.info(f"Duplicate webhook for wamid {message.get('id')}; skipping.")
                continue

            # Só atendemos voluntários com cadastro aprovado pela Comissão.
            if user_info.get('status') != 'approved':
                send_text(sender_id, MESSAGES['cadastro_em_analise'])
                continue

            # Memoriza o JID real de onde a pessoa fala (para entregar no número certo).
            if incoming_jid and user_info.get('wa_jid') != incoming_jid:
                try:
                    users_table.update_item(Key={'ID': user_id_clean},
                        UpdateExpression='SET wa_jid = :w',
                        ExpressionAttributeValues={':w': incoming_jid})
                    user_info['wa_jid'] = incoming_jid
                except Exception as e:
                    logger.error(f"Error saving wa_jid for '{user_id_clean}': {e}")

            state = user_info.get('conversation_state', 'initial')
            logger.info(f"User: {user_id_clean}, State: {state}, Action_ID: {action_id}")

            # A pergunta do CEP nunca bloqueia o menu: um clique de botão segue o fluxo normal.
            if action_id and state.startswith('awaiting_cep'):
                state = 'initial'

            # --- Button Click Router ---
            if action_id:
                if 'accept_' in action_id: 
                    handle_acceptance(sender_id, action_id.split('_')[-1])
                    continue
                elif 'decline_' in action_id:
                    send_text(sender_id, MESSAGES['confirmacao_recusa_para_recusante'])
                    continue
                elif action_id == 'open_menu':  # botão do template de boas-vindas
                    send_menu_or_ask_cep(sender_id, user_id_clean, user_info)
                    continue
                
                # --- FLUXO AJUDA URGENTE (2 ETAPAS) ---
                if state == 'awaiting_emergency_type':
                    type_choice = None
                    if action_id.endswith('emergency_type_emocional'): type_choice = "emocional"
                    elif action_id.endswith('emergency_type_atividade'): type_choice = "atividade"
                    elif action_id.endswith('emergency_type_seguranca'): type_choice = "seguranca"
                    
                    if type_choice:
                        send_emergency_timing_buttons(sender_id) 
                        new_state = f"awaiting_emergency_timing_{type_choice}" 
                        update_user_data(user_id_clean, new_state)
                    else:
                        logger.warning(f"Loop detectado ou action_id não reconhecido. Action_ID: '{action_id}'. Re-perguntando Etapa 1.")
                        send_emergency_type_buttons(sender_id) 
                    continue

                elif state.startswith('awaiting_emergency_timing_'):
                    timing_choice_id = action_id
                    timing_choice_text = ""
                    if timing_choice_id.endswith('emergency_timing_hoje'): timing_choice_text = "O quanto antes, hoje"
                    elif timing_choice_id.endswith('emergency_timing_24h'): timing_choice_text = "Nas próximas 24h"
                    elif timing_choice_id.endswith('emergency_timing_semana'): timing_choice_text = "Dentro da semana"
                    
                    type_choice_id = state.replace('awaiting_emergency_timing_', '')
                    type_choice_text = ""
                    if type_choice_id == 'emocional': type_choice_text = "Apoio emocional"
                    elif type_choice_id == 'atividade': type_choice_text = "Ajuda com atividades/evento"
                    elif type_choice_id == 'seguranca': type_choice_text = "Questão de saúde ou segurança"

                    if timing_choice_text and type_choice_text:
                        user_input_details = f"{type_choice_text} - Quando: {timing_choice_text}"
                        request_type = f"emergency_{type_choice_id}"
                        create_and_notify_request(sender_id, user_info, request_type, "🚨 Ajuda urgente", user_input_details, confirmation_message_key='emergency_confirmation')
                    else:
                        logger.warning(f"Action_id de tempo não reconhecido: '{timing_choice_id}'. Re-perguntando Etapa 2.")
                        send_emergency_timing_buttons(sender_id)
                    continue
                
                # --- FLUXO CARONA SOLIDÁRIA ---
                elif state == 'awaiting_ride_type':
                    if action_id.endswith('ride_type_medical'): 
                        send_text(sender_id, MESSAGES['ride_ask_details_medical'])
                        update_user_data(user_id_clean, 'awaiting_ride_details_medical')
                        continue
                    elif action_id.endswith('ride_type_pharmacy'): 
                        send_text(sender_id, MESSAGES['ride_ask_details_pharmacy'])
                        update_user_data(user_id_clean, 'awaiting_ride_details_pharmacy')
                        continue
                    elif action_id.endswith('ride_type_other'): 
                        send_text(sender_id, MESSAGES['ride_ask_details_other_step1'])
                        update_user_data(user_id_clean, 'awaiting_ride_other_step1')
                        continue

                # --- FLUXO MENU INICIAL ---
                elif state == 'initial':
                    if action_id.endswith('menu_emergency'): 
                        send_emergency_type_buttons(sender_id)
                        update_user_data(user_id_clean, 'awaiting_emergency_type')
                        continue
                    elif action_id.endswith('menu_ride'): 
                        send_ride_type_buttons(sender_id)
                        update_user_data(user_id_clean, 'awaiting_ride_type')
                        continue
                    elif action_id.endswith('menu_chat'): 
                        send_text(sender_id, MESSAGES['pergunta_batepapo'])
                        update_user_data(user_id_clean, 'awaiting_chat_details')
                        continue
            
            # --- CEP (perguntado uma vez, ver send_menu_or_ask_cep) ---
            if state.startswith('awaiting_cep') and not action_id:
                cep = dispatch.cep_digits(text_input)
                if cep:
                    save_user_fields(user_id_clean, cep=cep)
                    send_text(sender_id, MESSAGES['cep_salvo'])
                elif state == 'awaiting_cep' and text_input.lower() not in ('pular', 'nao', 'não'):
                    send_text(sender_id, MESSAGES['cep_invalido'])  # uma 2ª chance; depois segue sem CEP
                    update_user_data(user_id_clean, 'awaiting_cep_retry')
                    continue
                send_main_menu_with_buttons(sender_id)
                update_user_data(user_id_clean, 'initial')
                continue

            # --- State-based Text Input Flows ---
            if state in ['awaiting_ride_details_medical', 'awaiting_ride_details_pharmacy']:
                confirmation_key, alert_label, request_type = ('ride_confirm_generic', "🚗 Carona solidária", "ride_other")
                if state == 'awaiting_ride_details_medical':
                    confirmation_key, alert_label, request_type = ('ride_confirm_medical', "🚗 Carona p/ consulta", "ride_medical")
                elif state == 'awaiting_ride_details_pharmacy':
                    alert_label, request_type = ("🚗 Carona p/ farmácia", "ride_pharmacy")

                create_and_notify_request(sender_id, user_info, request_type, alert_label, text_input, confirmation_key)
                continue

            elif state == 'awaiting_ride_other_step1':
                send_text(sender_id, MESSAGES['ride_ask_details_other_step2'])
                update_user_data(user_id_clean, f"awaiting_ride_other_step2|{text_input}")
                continue
            
            elif state.startswith('awaiting_ride_other_step2|'):
                timing_details = text_input
                try:
                    location_details = state.split('|', 1)[1]
                except IndexError:
                    location_details = 'Não informado'
                
                user_input_combined = f"Local/Atividade: {location_details}\nDisponibilidade: {timing_details}"
                create_and_notify_request(sender_id, user_info, "ride_other", "🚗 Carona solidária - outros", user_input_combined, confirmation_message_key='ride_confirm_other_final')
                continue

            elif state == 'awaiting_chat_details':
                create_and_notify_request(sender_id, user_info, "chat", "💬 Bate-papo", text_input, 'ride_confirm_generic')
                continue

            # --- Default Flow ---
            if not action_id:
                if text_input and text_input.lower() == 'manual':
                    send_text(sender_id, MESSAGES['manual_usabilidade'])
                
                logger.info(f"No action_id and no text state match. Sending main menu. State was: {state}")
                send_menu_or_ask_cep(sender_id, user_id_clean, user_info)

        return {'statusCode': 200, 'body': json.dumps('Ok')}
    except Exception as e:
        logger.error(f"Critical Error in webhook processing: {e}", exc_info=True)
        return {'statusCode': 500, 'body': json.dumps('Internal Server Error')}