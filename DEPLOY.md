# Publicação do VetFinance

## Por que não usar apenas GitHub Pages

GitHub Pages hospeda HTML, CSS e JavaScript estáticos. Ele não executa Node.js no servidor, então não consegue receber upload de `.exe` pelo painel do dono.

## Caminho grátis recomendado

Use:

- GitHub para guardar o código.
- Render Free Web Service para rodar o Node.js.
- GitHub Releases para armazenar o instalador enviado pelo painel.

## Variáveis no Render

Configure em **Environment**:

```text
OWNER_USER=guigcs
OWNER_PASSWORD=gui123
SESSION_SECRET=troque-por-um-texto-longo
GITHUB_OWNER=seu_usuario_github
GITHUB_REPO=nome_do_repositorio
GITHUB_TOKEN=seu_token_github
GITHUB_RELEASE_TAG=vetfinance-installer
```

Use uma senha melhor que `gui123` quando o site estiver público.

## Comandos no Render

```text
Build Command: npm install
Start Command: npm start
```

## Limitação do plano grátis

O Render Free pode dormir após inatividade. Ao acessar depois de um tempo, a primeira abertura pode demorar cerca de um minuto. O instalador fica persistente porque o servidor envia o arquivo para GitHub Releases quando as variáveis do GitHub estão configuradas.
