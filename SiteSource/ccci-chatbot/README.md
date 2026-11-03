# Site da UniConecta (código-fonte)

App React (Vite, TypeScript, Tailwind, shadcn/ui) com a página inicial, o cadastro na
Rede de Apoio e a área administrativa. Ele chama a Lambda `UniconectaApp`
(`LambdaFiles/UniconectaApp`) pelo caminho `/behavior-dev`, que o CloudFront encaminha
ao API Gateway.

O build fica em `SiteFiles/ccci-chatbot`, e é essa pasta que o canvas publica no bucket
do site. Esta pasta guarda só o código-fonte.

## Desenvolver

```sh
cd SiteSource/ccci-chatbot
npm ci
npm run dev      # http://localhost:8080
npm test
```

`VITE_API_BASE` muda o caminho da API, que por padrão é `/behavior-dev`.

## Publicar uma versão nova

1. Faça push das mudanças em uma branch e abra o pull request. O workflow **Site build**
   compila e roda os testes no pull request.
2. Faça o merge. O workflow compila de novo, troca o conteúdo de
   `SiteFiles/ccci-chatbot` pelo build e faz commit na `main`, com a mensagem
   `Site build v<versão>`.
3. Depois desse commit, rode o pipeline do estágio no canvas.

Para refazer o build sem mudar o código, use **Actions → Site build → Run workflow**.

Não faça commit de um build feito na sua máquina nem edite `SiteFiles/ccci-chatbot` à
mão: o número da versão vem do workflow, e o próximo merge substitui a pasta inteira.

## Versão no rodapé

A página inicial mostra a versão ao lado do copyright:

| Estágio | Exemplo |
|---|---|
| Produção (`prod-2`) | `v2.1.27` |
| Desenvolvimento | `dev · v1.27` |

- O primeiro número é a versão blue/green do estágio. A Lambda devolve esse número em
  `GET /behavior-dev/version`, lido do nome da função (`UniconectaApp-prod-2`). O dev
  não tem esse número.
- Os dois números seguintes são a versão do software: o major do `package.json` e o
  número da execução do workflow. Um build local sai com `.0`.
