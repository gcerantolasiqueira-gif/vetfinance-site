# VetFinance

Site do VetFinance com servidor Node.js para login do dono, upload do instalador e download público.

## Rodar localmente

```bash
npm start
```

Abra:

```text
http://127.0.0.1:4173
```

## Conta do dono

- Usuário: `guigcs`
- Senha local padrão: `gui123`

Em produção, configure a senha no Render como variável `OWNER_PASSWORD`.

## Publicar grátis com GitHub + Render

GitHub Pages não serve para este projeto porque ele só publica site estático. Este site precisa de Node.js para receber upload.

Use Render Free Web Service:

1. Crie um repositório no GitHub e envie estes arquivos.
2. No Render, clique em **New > Web Service**.
3. Conecte o repositório do GitHub.
4. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: `Free`
5. Configure as variáveis:
   - `OWNER_USER`: `guigcs`
   - `OWNER_PASSWORD`: sua senha de dono
   - `SESSION_SECRET`: qualquer texto longo e secreto
   - `GITHUB_OWNER`: seu usuário do GitHub
   - `GITHUB_REPO`: nome do repositório
   - `GITHUB_TOKEN`: token do GitHub com permissão para criar/editar releases
   - `GITHUB_RELEASE_TAG`: `vetfinance-installer`

## Como funciona o instalador

- Localmente, o instalador é salvo na pasta `uploads/`.
- Online, se `GITHUB_TOKEN`, `GITHUB_OWNER` e `GITHUB_REPO` estiverem configurados, o instalador é salvo no GitHub Releases para continuar disponível mesmo se o Render Free reiniciar.

## Upload e download

1. Entre na área **Dono**.
2. Clique em **Buscar instalador**.
3. Selecione um arquivo `.exe`, `.msi` ou `.zip`.
4. Clique em **Subir e liberar download**.
5. O botão **Baixar VetFinance** passa a baixar o instalador publicado.
