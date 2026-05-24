import boto3
import os
import json
import logging
import urllib.request
import time
import random
import string
from datetime import datetime

# --- Logger Configuration ---
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Environment Variable Configurations ---
DYNAMODB_USERS_TABLE_NAME = os.environ.get('AWS_DYNAMODB_TABLE_TARGET_NAME_0')
DYNAMODB_REQUESTS_TABLE_NAME = os.environ.get('AWS_DYNAMODB_TABLE_TARGET_NAME_1')
AWS_REGION = os.environ.get('REGION', 'us-east-1')
API_URL = os.environ.get('API_URL', 'https://gate.whapi.cloud')
PARAM_NAME_TOKEN = os.getenv("AWS_SSM_PARAMETER_TARGET_NAME_0")

# --- Initial Validations ---
if not DYNAMODB_USERS_TABLE_NAME or not DYNAMODB_REQUESTS_TABLE_NAME or not PARAM_NAME_TOKEN:
    logger.error("CRITICAL ERROR: Essential environment variables not configured.")
    raise ValueError("Incomplete environment configuration.")

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
        "👉 {link do video}\n\n"
        "📘 Quer entender melhor como usar?\n"
        "Clique aqui para baixar o Manual de Usabilidade:\n"
        "👉 https://drive.google.com/file/d/1ESrx_r2kdJ1zygNscEKeVmUilJAe4ry9/view?usp=drive_link \n\n"
        "Agora é só escolher uma das opções abaixo 👇:"
    ),
    'emergency_confirmation': "Sua solicitação foi enviada aos voluntários mais próximos. \nSe ninguém entrar em contato rapidamente, por favor acione alguém de confiança que esteja por perto ou ligue para o 192 imediatamente. \nSua segurança é prioridade.",
    'erro_envio_notificacao': "Sua solicitação foi recebida, mas não foi possível notificar um ou mais contatos.",
    'erro_usuario_nao_encontrado': "Você não está registrado no nosso sistema. Não é possível continuar.",
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
    'feedback_prompt': (
        "A sua opinião é muito importante para nós! Estamos sempre em busca de evoluir a usabilidade e a experiência da Rede UniConecta CCCI.\n\n"
        "Se quiser contribuir com sugestões, críticas construtivas ou melhorias, envie um e-mail para: uniconecta@unicin.org\n\n"
        "A Rede de apoio UniConecta CCCI é construída por todos nós. \n"
        "Contamos com você para torná-la cada vez mais funcional, acolhedora e interassistencial!"
    ),
}

# --- Auxiliary Functions ---

def _send_whapi_request(endpoint, payload):
    headers = {
        'Authorization': f"Bearer {TOKEN}", 
        'Content-Type': 'application/json',
        # ADD THIS LINE:
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    data_bytes = json.dumps(payload).encode('utf-8')
    url = f"{API_URL}/{endpoint}"
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method='POST')

    try:
        with urllib.request.urlopen(req) as response:
            if 200 <= response.status < 300: 
                return True
            else: 
                logger.error(f"Error sending message. Status: {response.status}, Body: {response.read().decode()}")
                return False
    except urllib.error.HTTPError as e:
        # This will catch the 403 and read the actual JSON error from Whapi
        error_body = e.read().decode('utf-8')
        logger.error(f"HTTP Error {e.code}: {e.reason} - Payload Sent: {json.dumps(payload)} - Whapi Response: {error_body}")
        return False
    except urllib.error.URLError as e: 
        logger.error(f"Connection error: {e.reason}")
        return False
    except Exception as e: 
        logger.error(f"Unexpected error: {e}")
        return False

def send_whapi_message(to, body): 
    return _send_whapi_request('messages/text', {'to': to, 'body': body})

# --- NEW HELPER: Standardized to match the new WhatsApp/Whapi schema ---
def send_interactive_message(to, msg_type, body_text, action_dict, header_text=None, footer_text=None):
    payload = {
        "to": to,
        "type": msg_type,
        "body": {"text": body_text},
        "action": action_dict
    }
    
    if header_text:
        payload["header"] = {"text": header_text}
    if footer_text:
        payload["footer"] = {"text": footer_text}
        
    return _send_whapi_request('messages/interactive', payload)

def send_main_menu_with_buttons(to):
    action = {
        "buttons": [
            {"type": "quick_reply", "id": "menu_emergency", "title": "🚨 Ajuda Urgente"}, 
            {"type": "quick_reply", "id": "menu_ride", "title": "🚗 Carona Solidária"}, 
            {"type": "quick_reply", "id": "menu_chat", "title": "💬 Bate-papo"}
        ]
    }
    return send_interactive_message(to, "button", MESSAGES['menu_body'], action, header_text="UniConecta CCCI")

def send_alert_with_buttons(to, body_text, request_id):
    action = {
        "buttons": [
            {"type": "quick_reply", "id": f"accept_{request_id}", "title": "✅ Aceitar"}, 
            {"type": "quick_reply", "id": f"decline_{request_id}", "title": "❌ Recusar"}
        ]
    }
    return send_interactive_message(to, "button", body_text, action)

def send_emergency_type_buttons(to):
    # CRITICAL FIX: Titles shortened to stay under WhatsApp's 20 character limit
    action = {
        "buttons": [
            {"type": "quick_reply", "id": "emergency_type_seguranca", "title": "Saúde ou Segurança"},
            {"type": "quick_reply", "id": "emergency_type_emocional", "title": "Apoio Emocional"},
            {"type": "quick_reply", "id": "emergency_type_atividade", "title": "Atividades/Evento"}
        ]
    }
    return send_interactive_message(to, "button", MESSAGES['emergency_new_type_prompt'], action)

def send_emergency_timing_buttons(to):
    # CRITICAL FIX: Titles shortened to stay under WhatsApp's 20 character limit
    action = {
        "buttons": [
            {"type": "quick_reply", "id": "emergency_timing_hoje", "title": "Hoje (Urgente)"},
            {"type": "quick_reply", "id": "emergency_timing_24h", "title": "Nas próximas 24h"},
            {"type": "quick_reply", "id": "emergency_timing_semana", "title": "Dentro da semana"}
        ]
    }
    return send_interactive_message(to, "button", MESSAGES['emergency_new_timing_prompt'], action)
    
def send_ride_type_buttons(to):
    action = {
        "buttons": [
            {"type": "quick_reply", "id": "ride_type_medical", "title": "1- Consulta Médica"}, 
            {"type": "quick_reply", "id": "ride_type_pharmacy", "title": "2- Farmácia"}, 
            {"type": "quick_reply", "id": "ride_type_other", "title": "3- Outro lugar"}
        ]
    }
    return send_interactive_message(to, "button", MESSAGES['ride_intro'], action)


def get_user_info(user_id):
    try:
        response = users_table.get_item(Key={'ID': user_id})
        return response.get('Item')
    except Exception as e: 
        logger.error(f"Error fetching user '{user_id}': {e}")
        return None

def update_user_data(user_id, state):
    try:
        users_table.update_item(
            Key={'ID': user_id}, 
            UpdateExpression='SET conversation_state = :state', 
            ExpressionAttributeValues={':state': state}
        )
        logger.info(f"User data for '{user_id}' updated. New state: '{state}'.")
    except Exception as e: 
        logger.error(f"Error updating data for user '{user_id}': {e}")


# --- Request and Acceptance Flow Functions ---

def generate_request_id():
    return f"{''.join(random.choices(string.ascii_uppercase, k=3))}-{''.join(random.choices(string.digits, k=3))}"

def create_and_notify_request(sender_id, user_info, request_type, message_template, user_input="", confirmation_message_key='ride_confirm_generic'):
    user_id_clean = sender_id.replace('@s.whatsapp.net', '').replace('@c.us', '')
    user_name = user_info.get('nome', 'Nome não encontrado')
    contact_list = user_info.get('lista_contatos')
    if not contact_list:
        send_whapi_message(sender_id, MESSAGES['erro_sem_contato_emergencia'])
        update_user_data(user_id_clean, 'initial')
        return

    request_id = generate_request_id()
    try:
        requests_table.put_item(Item={
            'ID': request_id, 'requester_id': user_id_clean, 'requester_name': user_name,
            'contact_list': contact_list, 'status': 'pendente',
            'creation_timestamp': datetime.utcnow().isoformat(), 'request_type': request_type,
            'request_details': user_input, 'ttl': int(time.time()) + 86400 
        })
    except Exception as e:
        logger.error(f"Error creating request in DynamoDB: {e}")
        send_whapi_message(sender_id, "An internal error occurred while creating your request.")
        update_user_data(user_id_clean, 'initial')
        return

    final_message_text = message_template.format(user_name=user_name, user_number=user_id_clean, user_input=user_input, request_id=request_id)
    success_count = sum(1 for c in contact_list if send_alert_with_buttons(f"{str(c).strip()}@s.whatsapp.net", final_message_text, request_id))
    send_whapi_message(sender_id, MESSAGES[confirmation_message_key] if success_count > 0 else MESSAGES['erro_envio_notificacao'])
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
        send_whapi_message(accepter_id, MESSAGES['erro_solicitacao_nao_encontrada' if not request_item else 'erro_solicitacao_ja_aceita'])
        return

    accepter_info = get_user_info(accepter_id_clean)
    accepter_name = accepter_info.get('nome', 'Um contato') if accepter_info else 'Um contato'

    try:
        requests_table.update_item(
            Key={'ID': request_id},
            UpdateExpression='SET #st = :status, accepter_id = :accepter, acceptance_timestamp = :ts, accepter_name = :aname',
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={
                ':status': 'aceito', ':accepter': accepter_id_clean,
                ':ts': datetime.utcnow().isoformat(), ':aname': accepter_name 
            }
        )
    except Exception as e: 
        logger.error(f"Error updating status for request {request_id}: {e}")
        return

    requester_id = request_item['requester_id']
    requester_id_wa = f"{requester_id}@s.whatsapp.net"
    accepter_link = f"https://wa.me/{accepter_id_clean}"
    requester_link = f"https://wa.me/{requester_id}"

    # Envia confirmação para o solicitante
    send_whapi_message(requester_id_wa, MESSAGES['solicitacao_aceita_para_solicitante'].format(accepter_name=accepter_name, accepter_link=accepter_link))
    
    # Envia a nova mensagem de feedback (antigo NPS)
    send_whapi_message(requester_id_wa, MESSAGES['feedback_prompt'])

    # Envia confirmação para quem aceitou
    send_whapi_message(accepter_id, MESSAGES['confirmacao_aceite_para_aceitante'].format(requester_name=request_item['requester_name'], requester_link=requester_link))
    
    # Notifica os outros contatos
    for contact_num in request_item.get('contact_list', []):
        if str(contact_num).strip() not in [accepter_id_clean, requester_id]:
            send_whapi_message(f"{str(contact_num).strip()}@s.whatsapp.net", MESSAGES['notificacao_outros_contatos'].format(requester_name=request_item['requester_name']))

# --- Main Lambda Handler ---

def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event
        logger.info(f"Received body: {json.dumps(body)}")
        
        for message in body.get('messages', []):
            if message.get('from_me'): continue

            sender_id = message.get('chat_id') or message.get('from')
            user_id_clean = sender_id.replace('@s.whatsapp.net', '').replace('@c.us', '')
            
            text_input = message.get('text', {}).get('body', '').strip()
            
            button_reply_id = message.get('reply', {}).get('buttons_reply', {}).get('id')
            list_reply_id = message.get('reply', {}).get('list_reply', {}).get('id')
            action_id = button_reply_id or list_reply_id

            if action_id: logger.info(f"Received ACTION_ID: '{action_id}'")
            if text_input: logger.info(f"Received TEXT_INPUT: '{text_input}'")

            # --- Authenticated User Flow ---
            user_info = get_user_info(user_id_clean)
            if not user_info:
                send_whapi_message(sender_id, MESSAGES['erro_usuario_nao_encontrado'])
                continue
            
            state = user_info.get('conversation_state', 'initial')
            logger.info(f"User: {user_id_clean}, State: {state}, Action_ID: {action_id}")

            # --- Button Click Router ---
            if action_id:
                if 'accept_' in action_id: 
                    handle_acceptance(sender_id, action_id.split('_')[-1])
                    continue
                elif 'decline_' in action_id: 
                    send_whapi_message(sender_id, MESSAGES['confirmacao_recusa_para_recusante'])
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
                        user_input_details = f"Tipo de Ajuda: *{type_choice_text}*\nQuando: *{timing_choice_text}*"
                        template = (
                            f"🚨 ALERTA - AJUDA URGENTE 🚨\n"
                            f"*{{user_name}}* ({{user_number}}) precisa de ajuda.\n\n"
                            f"Detalhes da Solicitação:\n"
                            f"{user_input_details}"
                        )
                        request_type = f"emergency_{type_choice_id}"
                        create_and_notify_request(sender_id, user_info, request_type, template, user_input_details, confirmation_message_key='emergency_confirmation')
                    else:
                        logger.warning(f"Action_id de tempo não reconhecido: '{timing_choice_id}'. Re-perguntando Etapa 2.")
                        send_emergency_timing_buttons(sender_id)
                    continue
                
                # --- FLUXO CARONA SOLIDÁRIA ---
                elif state == 'awaiting_ride_type':
                    if action_id.endswith('ride_type_medical'): 
                        send_whapi_message(sender_id, MESSAGES['ride_ask_details_medical'])
                        update_user_data(user_id_clean, 'awaiting_ride_details_medical')
                        continue
                    elif action_id.endswith('ride_type_pharmacy'): 
                        send_whapi_message(sender_id, MESSAGES['ride_ask_details_pharmacy'])
                        update_user_data(user_id_clean, 'awaiting_ride_details_pharmacy')
                        continue
                    elif action_id.endswith('ride_type_other'): 
                        send_whapi_message(sender_id, MESSAGES['ride_ask_details_other_step1'])
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
                        send_whapi_message(sender_id, MESSAGES['pergunta_batepapo'])
                        update_user_data(user_id_clean, 'awaiting_chat_details')
                        continue
            
            # --- State-based Text Input Flows ---
            if state in ['awaiting_ride_details_medical', 'awaiting_ride_details_pharmacy']:
                confirmation_key, alert_prefix, request_type = ('ride_confirm_generic', "[CARONA SOLIDÁRIA]", "ride_other")
                if state == 'awaiting_ride_details_medical': 
                    confirmation_key, alert_prefix, request_type = ('ride_confirm_medical', "[CARONA P/ CONSULTA]", "ride_medical")
                elif state == 'awaiting_ride_details_pharmacy': 
                    alert_prefix, request_type = ("[CARONA P/ FARMÁCIA]", "ride_pharmacy")
                
                template = f"{alert_prefix} *{{user_name}}* precisa de carona e informou: _{{user_input}}_"
                create_and_notify_request(sender_id, user_info, request_type, template, text_input, confirmation_key)
                continue

            elif state == 'awaiting_ride_other_step1':
                send_whapi_message(sender_id, MESSAGES['ride_ask_details_other_step2'])
                update_user_data(user_id_clean, f"awaiting_ride_other_step2|{text_input}")
                continue
            
            elif state.startswith('awaiting_ride_other_step2|'):
                timing_details = text_input
                try:
                    location_details = state.split('|', 1)[1]
                except IndexError:
                    location_details = 'Não informado'
                
                user_input_combined = f"Local/Atividade: {location_details}\nDisponibilidade: {timing_details}"
                template = f"[CARONA SOLIDÁRIA - OUTROS] *{{user_name}}* ({{user_number}}) precisa de apoio e informou:\n\n{user_input_combined}"
                
                create_and_notify_request(sender_id, user_info, "ride_other", template, user_input_combined, confirmation_message_key='ride_confirm_other_final')
                continue

            elif state == 'awaiting_chat_details':
                template = "[BATE-PAPO] *{user_name}* gostaria de conversar e deu os seguintes detalhes: _{user_input}_"
                create_and_notify_request(sender_id, user_info, "chat", template, text_input, 'ride_confirm_generic')
                continue

            # --- Default Flow ---
            if not action_id:
                if text_input and text_input.lower() == 'manual':
                    send_whapi_message(sender_id, MESSAGES['manual_usabilidade'])
                
                logger.info(f"No action_id and no text state match. Sending main menu. State was: {state}")
                send_main_menu_with_buttons(sender_id)
                update_user_data(user_id_clean, 'initial')

        return {'statusCode': 200, 'body': json.dumps('Ok')}
    except Exception as e:
        logger.error(f"Critical Error in webhook processing: {e}", exc_info=True)
        return {'statusCode': 500, 'body': json.dumps('Internal Server Error')}
