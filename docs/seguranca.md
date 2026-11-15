# Segurança da aplicação desktop

## Renderização

SQL, mensagens de erro, sugestões, nomes de operações, tabelas e métricas são tratados como dados. `HtmlSafety.escape` codifica os caracteres especiais de HTML, incluindo aspas simples e duplas, antes da interpolação em texto ou atributos delimitados por aspas.

O destaque de SQL separa texto e marcação: os trechos são classificados antes de serem escapados, e somente os elementos de destaque definidos pelo aplicativo são gerados. O SQL original não é convertido em HTML nem substituído por marcadores que possam colidir com a entrada.

As dicas de plano aceitam exclusivamente as tags literais `<strong>` e `</strong>`, sem atributos. Qualquer outra marcação é exibida como texto. Essa permissão não se aplica a SQL ou mensagens.

Referências aceitam URLs absolutas HTTP ou HTTPS, sem credenciais, espaços ou caracteres de controle. URLs inválidas são apresentadas apenas pelo título. Referências válidas abrem no navegador do sistema; janelas adicionais do Electron são negadas.

Os templates HTML continuam sendo conteúdo confiável do aplicativo. O handler `load-template` consulta uma lista fechada de páginas e não constrói caminhos a partir da entrada recebida.

## Electron e IPC

A janela mantém `contextIsolation`, sandbox e segurança da plataforma habilitados, com integração Node.js desabilitada. Navegação externa, redirecionamentos e anexação de webviews são bloqueados. A CSP impede scripts inline, objetos e frames.

Todos os handlers IPC verificam a janela de origem, o frame principal e a URL exata do documento do aplicativo. As consultas recebidas precisam ser strings não vazias, sem caracteres nulos e com até 100000 caracteres. Essa validação de transporte não substitui uma política semântica dos comandos permitidos no modo de execução real.

## Conexões e credenciais

Somente MySQL em `localhost`, `127.0.0.1` ou `::1` é aceito. Host, porta, usuário, schema e senha são validados antes do teste, salvamento e conexão pelo driver. Opções adicionais recebidas não são encaminhadas ao driver. O salvamento depende de um teste de conexão bem-sucedido.

Credenciais são criptografadas com `safeStorage`; a persistência é recusada quando não existe criptografia disponível ou quando o backend Linux é `basic_text`. O arquivo recebe permissões `0600` nas plataformas que aplicam permissões POSIX. A proteção depende do chaveiro e das garantias do sistema operacional.

A senha salva não retorna ao renderer. A opção “Usar senha salva” solicita sua reutilização no processo principal, somente se SGBD, host, porta, usuário e schema coincidirem com a configuração persistida. Desmarcar a opção permite substituir a senha, inclusive por uma senha vazia. Após salvar, o campo é limpo e o estado da interface contém apenas metadados da conexão.

Senhas digitadas existem temporariamente no formulário e na mensagem IPC de salvamento ou teste. A aplicação não promete criptografia de strings JavaScript em memória. Erros do gerenciador de credenciais não incluem o conteúdo descriptografado nos logs.

## Verificação

Execute `npm test -- --runInBand` para validar os testes de domínio, infraestrutura, IPC e renderização com DOM. Os testes de segurança incluem HTML malicioso, quebra de atributos por aspas, diferenças entre consultas, protocolos proibidos em links, travessia de diretórios, frames não autorizados, conexões externas e isolamento da senha salva.

Os testes da janela Electron e do driver usam mocks. A abertura gráfica, o chaveiro nativo e a conexão com MySQL real exigem validação no ambiente de uso. No Linux, o sistema deve permitir a execução do sandbox do Chromium; o comando padrão não desabilita essa proteção.
