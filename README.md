# Controle de Veículos

Aplicativo (PWA) para controlar despesas, consumo e manutenção dos veículos da família.
Funciona no navegador do PC e pode ser instalado no celular.

- `npm install` e `npm run dev` para rodar localmente
- `npm run build` gera a versão publicável em `dist/`

## Publicação

A cada envio para `main`, o GitHub Actions gera o app e publica no GitHub Pages.

## Banco de dados (Supabase)

O arquivo `supabase/schema.sql` cria as tabelas, as regras de segurança (cada família só vê os
próprios dados) e as funções de criar/entrar numa família. Basta colá-lo no SQL Editor do Supabase.
