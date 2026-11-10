# UniConecta

Este repositório guarda o código do UniConecta: o site de cadastro na Rede de Apoio, o
painel dos administradores, a API que atende os dois e o bot de WhatsApp que encaminha os
pedidos de apoio aos voluntários aprovados.

A infraestrutura (API Gateway, CloudFront, DynamoDB, parâmetros do SSM, DNS) não está
neste repositório. Ela é desenhada no canvas do Struct8, na caixa `Unicin-Uniconecta`, e o
pipeline do canvas busca o código aqui a cada apply.

## Pastas

| Pasta | Conteúdo | Vai ao ar |
|---|---|---|
| `SiteSource/ccci-chatbot` | Código-fonte do site e do painel (React, Vite, TypeScript). Ver o [README do site](SiteSource/ccci-chatbot/README.md). | Não. O workflow **Site build** gera o build a partir dele. |
| `SiteFiles/ccci-chatbot` | Build do site, gravado pelo workflow **Site build** a cada merge. Não edite à mão. | Sim |
| `LambdaFiles/UniconectaApp` | API do site: cadastro, login do painel, lista e edição dos cadastros, consulta ao ICnet e mensagem de boas-vindas na aprovação. | Sim |
| `LambdaFiles/BOT` | Webhook do WhatsApp: recebe as mensagens e conduz as conversas com solicitantes e voluntários. | Sim |
| `LambdaFiles/lambda_check` | Monitor executado pelo Timer do EventBridge: amplia o envio dos pedidos em ondas, avisa os supervisores dos pedidos sem resposta, reinicia as conversas paradas, envia a mensagem de feedback depois do aceite e grava o arquivo diário dos pedidos no S3. | Sim |
| `LambdaFiles/UniConAppAdm`, `LambdaFiles/UniconectaAppAdm`, `LambdaFiles/UniconectaAppPub` | Arquivos de 6 linhas de uma versão antiga. Nenhum state do canvas os usa. | Não |
| `tools/whatsapp` | Guia da WhatsApp Cloud API, script de criação dos templates e teste de ponta a ponta local. Ver o [README da pasta](tools/whatsapp/README.md). | Não |
| `.github/workflows/site-build.yml` | Workflow **Site build**: testa e compila o site. | Não |
| `.github/workflow/lambda-sync.yml` | Workflow **CloudMan Sync Listener**, de sincronização de código pelo CloudMan. Não participa do build nem do deploy. | Não |

`BOT`, `lambda_check` e `UniconectaApp` têm cada uma a sua cópia de `xray_lite.py`, que
registra no X-Ray as chamadas ao DynamoDB, ao SSM e às APIs externas. Uma mudança nesse
arquivo precisa ser copiada para as três pastas.

## Como o código vai ao ar

Cada apply do canvas roda no GitHub Actions do repositório `UnicinRepoOrg/UNICIN-CICD`.
O pipeline copia da branch `main` deste repositório as pastas `LambdaFiles/UniconectaApp`,
`LambdaFiles/BOT`, `LambdaFiles/lambda_check` e `SiteFiles/ccci-chatbot`, e publica o que
encontrar nelas.

- Um merge na `main` não publica nada sozinho. O código vai ao ar no próximo apply de cada
  estágio.
- **Importante:** o apply da produção também publica tudo o que estiver na `main` naquele
  momento. Teste no dev antes de aplicar a produção.

### Estágios

| Estágio | State no canvas | Pasta no `UNICIN-CICD` | Nome das Lambdas |
|---|---|---|---|
| Desenvolvimento | `UniConecta`, na caixa `APP` | `UniConecta-dev` | `UniconectaApp-dev`, `BOT-dev`, `lambda_check-dev` |
| Produção | `UniConecta`, na caixa da versão dentro de `APP` (por exemplo `blue`) | `UniConecta-prod-<N>` | `UniconectaApp-prod-<N>`, `BOT-prod-<N>`, `lambda_check-prod-<N>` |

O site do dev fica em `dev.uniconecta.unicin.org`.

A produção usa blue/green. Cada versão é um state próprio, e o número `<N>` identifica a
versão. O parâmetro do SSM `TrafficVersion` guarda a divisão do tráfego entre as versões,
e o `lambda_check` só envia avisos na versão que recebe o tráfego.

### Fluxo de uma mudança

1. Crie uma branch a partir da `main` atual. Outras pessoas também fazem push neste
   repositório.
2. Abra o pull request. Se a mudança tocar o site, o workflow **Site build** roda os
   testes e o build.
3. Faça o merge. Se a mudança tocar o site, o workflow grava o build em
   `SiteFiles/ccci-chatbot` com um commit `Site build v<versão>` na `main`.
4. No canvas, rode o apply do state `UniConecta` da caixa `APP`, que é o dev, e teste no
   dev.
5. Rode o apply do state da versão de produção.

## Versões

**Site:** a versão é `<major>.<build>`, por exemplo `1.5`. O `vite.config.ts` monta o
número no build, e o rodapé do site o mostra.

- **Build:** é o `run_number` do workflow **Site build** no GitHub Actions. Ele sobe 1 a
  cada execução, inclusive nas de pull request, que só testam e compilam, e nas
  execuções manuais. Por isso as versões publicadas pulam números: a `v1.3` foi seguida
  pela `v1.5`, porque a execução 4 foi a do pull request.
- **Major:** é o primeiro número do campo `version` do
  `SiteSource/ccci-chatbot/package.json`. Para mudar, altere o campo, por exemplo de
  `1.0.0` para `2.0.0`, no mesmo pull request da mudança que justifica o novo major. O
  build continua de onde estava: depois da `v1.5`, a primeira versão com o major novo é,
  por exemplo, a `v2.7`, e não a `v2.0`. O segundo e o terceiro números do campo não
  aparecem na versão.
- **Gatilho:** o workflow roda quando um pull request ou um merge muda algum arquivo em
  `SiteSource/ccci-chatbot/`, inclusive o README dessa pasta. Em um pull request, ele
  também roda quando o próprio `site-build.yml` muda. Uma mudança só nas Lambdas ou na
  documentação da raiz não gera versão nova do site.

Na produção, o rodapé mostra também o número blue/green na frente, por exemplo
`v2.1.27`. O [README do site](SiteSource/ccci-chatbot/README.md#versão-no-rodapé) mostra
os exemplos de cada estágio.

**Lambdas:** as Lambdas não têm número de versão. O que está no ar em um estágio é o
commit da `main` no momento do último apply, e a execução correspondente fica registrada
no Actions do `UnicinRepoOrg/UNICIN-CICD`. A rota `GET /behavior-dev/version` da
`UniconectaApp` devolve o estágio e o número blue/green, lidos do nome da função.

## Configuração e segredos

- **Tokens e configurações** ficam em parâmetros do SSM de cada estágio, ligados às
  Lambdas no canvas. As chaves do parâmetro `uniconecta-config` estão descritas no
  próprio parâmetro, na aba **Attributes** do canvas.
- **Variáveis de ambiente** com nomes como `AWS_DYNAMODB_TABLE_NAME_0` e
  `AWS_SSM_PARAMETER_NAME_1` são geradas pelo canvas a partir das conexões de cada
  Lambda. Não as defina à mão.
- A `UniconectaApp` lê o `uniconecta-config` uma vez a cada container novo. Um valor
  alterado vale para os containers que começam depois da mudança.
- Nenhum segredo vai para o repositório. O teste local lê as variáveis de
  `tools/whatsapp/.env`, que o `.gitignore` exclui. O `tools/whatsapp/.env.example` mostra
  as variáveis esperadas.

## Testes

| O quê | Comando |
|---|---|
| Site | `npm test` em `SiteSource/ccci-chatbot`. O workflow **Site build** roda o mesmo comando nos pull requests que mudam o site. |
| As três Lambdas, de ponta a ponta | `LIVE=0 python3 tools/whatsapp/e2e_local.py`. Roda as Lambdas reais com DynamoDB e SSM em memória e não precisa de conta da AWS. |

Com `LIVE=1`, o teste de ponta a ponta envia mensagens de verdade pelo WhatsApp, mas só
para os números de `TEST_TO` e `TEST_TO_2`.

O teste local não consulta o ICnet, porque o token da API fica no SSM: o cadastro é
gravado com a consulta marcada como não configurada. A consulta real se testa no dev.
