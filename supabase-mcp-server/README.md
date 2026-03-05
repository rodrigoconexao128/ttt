# Supabase MCP Server Configuration

Este diretório contém a configuração do servidor MCP (Model Context Protocol) do Supabase.

## Configuração

O servidor foi configurado no arquivo `cline_mcp_settings.json` com as seguintes características:

- **Nome**: `github.com/supabase-community/supabase-mcp`
- **Tipo**: HTTP
- **URL**: `https://mcp.supabase.com/mcp?read_only=true&features=database,docs,development`

## Parâmetros de Configuração

- `read_only=true`: Modo somente leitura para segurança
- `features=database,docs,development`: Grupos de ferramentas habilitadas

## Ferramentas Disponíveis

### Database
- `list_tables`: Lista todas as tabelas nos esquemas especificados
- `list_extensions`: Lista todas as extensões no banco de dados
- `list_migrations`: Lista todas as migrações no banco de dados
- `execute_sql`: Executa SQL bruto no banco de dados (somente leitura)

### Documentation
- `search_docs`: Pesquisa na documentação do Supabase

### Development
- `get_project_url`: Obtém a URL API para um projeto
- `get_publishable_keys`: Obtém as chaves API anônimas para um projeto
- `generate_typescript_types`: Gera tipos TypeScript baseados no esquema do banco

## Segurança

A configuração usa modo somente leitura (`read_only=true`) como recomendado nas melhores práticas de segurança do Supabase.

## Autenticação

O servidor usa OAuth 2.1 com Dynamic Client Registration. O cliente MCP solicitará login no Supabase durante a configuração inicial.
