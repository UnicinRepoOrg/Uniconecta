# WhatsApp Business Cloud API (Meta): setup e testes

O bot (`LambdaFiles/BOT`), o monitor (`LambdaFiles/lambda_check`) e a API do site (`LambdaFiles/UniconectaApp`) usam a **WhatsApp Cloud API** da Meta (`POST {GRAPH_API_URL}/{WA_PHONE_NUMBER_ID}/messages`). O Whapi.cloud não é mais usado.

## Regra das 24h e templates
A Meta só aceita mensagem livre (texto, botões) para quem falou com o número nas últimas 24h. Fora disso, só **template aprovado**:

| Template (UTILITY, pt_BR) | Enviado por | Quando |
|---|---|---|
| `alerta_rede_apoio` (`{{1}}` solicitante, `{{2}}` tipo, `{{3}}` detalhes, `{{4}}` código; botões Aceitar / Indisponível) | BOT | nova solicitação → toda a rede aprovada |
| `boas_vindas_aprovado` (`{{1}}` nome; botão Abrir menu) | UniconectaApp | admin muda o status para `approved` |

Envio **best-effort** (livre, pode falhar fora da janela): alerta ao supervisor (`lambda_check`) e o aviso "solicitação já atendida" aos outros membros. As falhas aparecem no CloudWatch do BOT como `Delivery FAILED ... 131047`.

```bash
cp tools/whatsapp/.env.example tools/whatsapp/.env   # preencha o token
python3 tools/whatsapp/create_templates.py --check   # token / número / webhook (somente leitura)
python3 tools/whatsapp/create_templates.py           # cria os templates que faltam + status
python3 tools/whatsapp/create_templates.py --status
```

## Variáveis de ambiente (AWS Lambda)

| Variável | BOT | lambda_check | UniconectaApp | Valor |
|---|---|---|---|---|
| `GRAPH_API_URL` | ✓ | ✓ | ✓ | `https://graph.facebook.com/v26.0` (substitui `API_URL`, pode remover) |
| `WA_PHONE_NUMBER_ID` | ✓ | ✓ | ✓ | `1413979345131573` |
| `AWS_SSM_PARAMETER_NAME_0` | ✓ | ✓ | ✓ **novo** | mesmo parâmetro SSM; **valor (SecureString) = access token da Meta** |
| `WA_VERIFY_TOKEN` | ✓ | | | string aleatória; a mesma no painel de webhook da Meta |
| `WA_APP_SECRET` | ✓ | | | App → Configurações → Básico → Chave secreta (valida `X-Hub-Signature-256`) |
| `WA_TEMPLATE_ALERT` / `WA_TEMPLATE_WELCOME` / `WA_TEMPLATE_LANG` | ✓ | | ✓ | opcionais: `alerta_rede_apoio` / `boas_vindas_aprovado` / `pt_BR` |

- O papel IAM da **UniconectaApp** precisa de `ssm:GetParameter` (e `kms:Decrypt`, se a chave KMS for própria) nesse parâmetro. Se o envio falhar, a aprovação continua funcionando: só fica um log.
- Timeout do BOT ≥ 30s (o alerta é enviado em sequência para toda a rede).
- Token: use um **System User token permanente** (Business Settings → Usuários do sistema) com `whatsapp_business_messaging` e `whatsapp_business_management`. Nunca no git.

## Checklist de virada (cutover)
1. Atualizar o valor do parâmetro SSM com o token da Meta e criar as variáveis acima.
2. Deploy das 3 Lambdas (CloudMan pull Git → AWS).
3. Meta App → WhatsApp → Configuração → Webhook: **Callback URL** = URL pública do BOT (a mesma que hoje está no Whapi); **Verify token** = `WA_VERIFY_TOKEN`; assinar o campo **messages**.
4. Inscrever o app na WABA (se `--check` mostrar `subscribed_apps` vazio):
   `curl -X POST "https://graph.facebook.com/v26.0/1097407789946330/subscribed_apps" -H "Authorization: Bearer $TOKEN"`
5. Número registrado na Cloud API, com forma de pagamento na WABA (templates são cobrados).
6. **Desligar o webhook / canal do Whapi**, para cada mensagem não ser tratada duas vezes.
7. Smoke test: mande "oi" de um número aprovado → menu; faça login no admin, aprove um cadastro de teste → boas-vindas; faça uma solicitação → alerta no outro número → Aceitar.

## Teste E2E local
`e2e_local.py` roda as 3 Lambdas reais com DynamoDB/SSM em memória (não precisa de AWS nem de boto3).
```bash
LIVE=0 python3 tools/whatsapp/e2e_local.py   # tudo mockado
LIVE=1 python3 tools/whatsapp/e2e_local.py   # envia de verdade, só para TEST_TO / TEST_TO_2
```
No modo LIVE, mande antes uma mensagem do `TEST_TO` para o número da empresa, para abrir a janela de 24h (o menu e as confirmações são mensagens livres). Os templates precisam estar `APPROVED`.
