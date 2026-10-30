# WhatsApp Business Cloud API (Meta): setup e testes

O bot (`LambdaFiles/BOT`), o monitor (`LambdaFiles/lambda_check`) e a API do site (`LambdaFiles/UniconectaApp`) usam a **WhatsApp Cloud API** da Meta (`POST {GRAPH_API_URL}/{WA_PHONE_NUMBER_ID}/messages`). O Whapi.cloud não é mais usado.

## Regra das 24h e templates
A Meta só aceita mensagem livre (texto, botões) para quem falou com o número nas últimas 24h. Fora disso, só **template aprovado**:

| Template (UTILITY, pt_BR) | Enviado por | Quando |
|---|---|---|
| `alerta_rede_apoio` (`{{1}}` solicitante, `{{2}}` tipo, `{{3}}` detalhes, `{{4}}` código; botões Aceitar / Indisponível) | BOT / lambda_check | nova solicitação → rede aprovada, em ondas por CEP (ver abaixo) |
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
| `WA_TEMPLATE_ALERT` / `WA_TEMPLATE_WELCOME` / `WA_TEMPLATE_LANG` | ✓ | ✓ | ✓ | opcionais: `alerta_rede_apoio` / `boas_vindas_aprovado` / `pt_BR` |
| `DISPATCH_MODE` | ✓ | | | `broadcast` (padrão: rede toda de uma vez) ou `waves` (ondas por CEP) |
| `WAVE_INTERVAL_MIN` | ✓ | ✓ | | opcional: `15` (minutos entre ondas e até o supervisor); mesmo valor nas duas |
| `MIN_ONDA` | ✓ | | | opcional: `3` (mínimo de pessoas por onda) |

- O papel IAM da **UniconectaApp** precisa de `ssm:GetParameter` (e `kms:Decrypt`, se a chave KMS for própria) nesse parâmetro. Se o envio falhar, a aprovação continua funcionando: só fica um log.
- Timeout do BOT ≥ 30s (o alerta é enviado em sequência para toda a rede).
- Token: use um **System User token permanente** (Business Settings → Usuários do sistema) com `whatsapp_business_messaging` e `whatsapp_business_management`. Nunca no git.

## Supervisores
O alerta de solicitação pendente há mais de 1h (`lambda_check`) vai para os usuários do `DBBot` com **`is_supervisor` = `true`** (Boolean) e `status` = `approved`. Para incluir ou tirar alguém, edite o item no console do DynamoDB. Nenhum número fica no código.

## Envio em ondas por CEP (`DISPATCH_MODE=waves`)
Em vez de avisar a rede toda de uma vez, o BOT avisa primeiro quem mora mais perto de quem pediu, e o `lambda_check` amplia o envio a cada `WAVE_INTERVAL_MIN` enquanto o pedido estiver pendente:

| Nível | Quem |
|---|---|
| 0 | mesmo CEP (8 dígitos): mesmo condomínio ou rua |
| 1 | mesmos 5 primeiros dígitos do CEP, ou mesmo bairro (sem acento/maiúsculas) |
| 2 | mesmos 4 primeiros dígitos |
| 3 | mesmos 3 primeiros dígitos |
| 4 | resto da rede, inclusive quem não tem CEP |

- Cada onda junta níveis até ter pelo menos `MIN_ONDA` pessoas; níveis vazios são pulados.
- **Ajuda urgente** vai para a rede toda na hora.
- Com a rede toda avisada e o pedido ainda pendente, o supervisor recebe o alerta `WAVE_INTERVAL_MIN` depois.
- As ondas são calculadas na criação (`LambdaFiles/BOT/dispatch.py`) e gravadas no pedido: `waves`, `waves_sent`, `next_wave_at`, `all_notified_at`. Pedidos sem `waves` (modo `broadcast`) seguem a regra antiga do supervisor (1h).
- **O agendamento (EventBridge) do `lambda_check` precisa rodar a cada 5 min ou menos**; senão o intervalo real entre ondas fica maior que 15 min.
- O CEP vem do cadastro (`cep`, 8 dígitos, opcional na API). A quem não tem, o BOT pergunta uma única vez ao abrir o menu (responder `pular` segue sem CEP).

**Campo no formulário do site** (o código-fonte do site não está neste repo): campo `cep` obrigatório, máscara `00000-000`, logo depois de "Bairro", com o texto de ajuda *"Usamos o CEP para avisar primeiro os voluntários que moram mais perto de você."*; enviado no `POST /cadastro` e no `PATCH /recipients/{id}` do admin. A API responde 400 para CEP que não tenha 8 dígitos.

**Ordem de ativação:** deploy das 3 Lambdas → conferir o agendamento do `lambda_check` → `DISPATCH_MODE=waves` no BOT. Para voltar atrás, `DISPATCH_MODE=broadcast`.

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
