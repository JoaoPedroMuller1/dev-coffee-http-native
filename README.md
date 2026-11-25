# Dev Coffee API

Trabalho da AP2 de Desenvolvimento Back-End. É uma API pra controlar a fila de pedidos da cafeteria Dev Coffee, feita só com o módulo `http` nativo do Node.js. Não usei Express nem nenhum pacote do npm, então o roteamento, a leitura do body e as validações estão todos feitos na mão no `server.js`.

Os pedidos ficam em memória. Se o servidor reiniciar, a lista zera e os IDs voltam pro 1.

## Autor

- Nome: João Pedro Muller
- GitHub: [JoaoPedroMuller1](https://github.com/JoaoPedroMuller1)

## Como rodar

Precisa do Node.js 18 ou mais novo.

```bash
git clone https://github.com/JoaoPedroMuller1/dev-coffee-http-native.git
cd dev-coffee-http-native
npm start
```

Não precisa de `npm install` porque o projeto não tem dependência nenhuma. O servidor sobe em `http://localhost:3000`. Pra usar outra porta:

```bash
PORT=8080 npm start          # Linux, macOS ou Git Bash
$env:PORT=8080; npm start    # PowerShell
```

Cada requisição aparece no terminal, tipo `POST /orders -> 201`.

## Pedido (Order)

Todo pedido tem esse formato:

```json
{
  "id": 1,
  "client": "Nome do Cliente",
  "item": "Nome do Café/Produto",
  "status": "pendente"
}
```

- `id`: o servidor gera sozinho, em sequência. Se um pedido for apagado, o id dele não é usado de novo.
- `client` e `item`: texto, obrigatórios, não podem vir vazios.
- `status`: só aceita `"pendente"`, `"pronto"` ou `"cancelado"`. Todo pedido novo começa como `"pendente"`.

## Rotas

| Método | Rota | Retorno |
|---|---|---|
| GET | `/orders` | 200 com a lista (dá pra filtrar com `?status=`) |
| GET | `/orders/:id` | 200 ou 404 |
| POST | `/orders` | 201 ou 400 |
| PATCH | `/orders/:id/status` | 200, 400 ou 404 |
| DELETE | `/orders/:id` | 204 sem corpo ou 404 |
| qualquer outro | qualquer outra rota | 404 |

Toda resposta que tem corpo vem com `Content-Type: application/json; charset=utf-8`. O 204 do DELETE não tem corpo, então também não tem esse header.

Quando dá erro, a resposta vem assim (o `details` só aparece quando tem algo a mais pra explicar):

```json
{
  "error": "Bad Request",
  "message": "Dados do pedido inválidos.",
  "details": ["O campo \"item\" é obrigatório."]
}
```

## Testando com cURL

Os comandos estão no formato do bash (Linux, macOS ou Git Bash no Windows). O `-i` serve pra mostrar o status e os headers da resposta.

No PowerShell o `curl` é outro comando (`Invoke-WebRequest`), então lá é melhor usar o Git Bash, o Thunder Client ou o Postman, ou chamar `curl.exe`.

### Criar pedido (POST /orders)

```bash
curl -i -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"client": "Ana", "item": "Cappuccino"}'
```

Volta `201 Created`, com o header `Location: /orders/1`:

```json
{ "id": 1, "client": "Ana", "item": "Cappuccino", "status": "pendente" }
```

Criei mais dois pra ter o que listar e filtrar depois:

```bash
curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" -d '{"client": "Bruno", "item": "Espresso"}'
curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" -d '{"client": "Carla", "item": "Latte"}'
```

Se faltar algum campo, volta `400`:

```bash
curl -i -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"client": "Ana"}'
```

```json
{ "error": "Bad Request", "message": "Dados do pedido inválidos.", "details": ["O campo \"item\" é obrigatório."] }
```

JSON quebrado também volta `400`, e o servidor continua rodando normal:

```bash
curl -i -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"client": "Ana", "item": '
```

### Listar pedidos (GET /orders)

```bash
curl -i http://localhost:3000/orders
```

Volta `200 OK`:

```json
[
  { "id": 1, "client": "Ana", "item": "Cappuccino", "status": "pendente" },
  { "id": 2, "client": "Bruno", "item": "Espresso", "status": "pendente" },
  { "id": 3, "client": "Carla", "item": "Latte", "status": "pendente" }
]
```

Pra filtrar por status:

```bash
curl -i "http://localhost:3000/orders?status=pendente"
```

### Buscar um pedido (GET /orders/:id)

```bash
curl -i http://localhost:3000/orders/1
```

Volta `200 OK`:

```json
{ "id": 1, "client": "Ana", "item": "Cappuccino", "status": "pendente" }
```

Com um id que não existe, volta `404`:

```bash
curl -i http://localhost:3000/orders/999
```

```json
{ "error": "Not Found", "message": "Pedido com id \"999\" não encontrado." }
```

### Mudar o status (PATCH /orders/:id/status)

```bash
curl -i -X PATCH http://localhost:3000/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "pronto"}'
```

Volta `200 OK` com o pedido atualizado:

```json
{ "id": 1, "client": "Ana", "item": "Cappuccino", "status": "pronto" }
```

Com um status que não está na lista, volta `400`:

```bash
curl -i -X PATCH http://localhost:3000/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "entregue"}'
```

```json
{ "error": "Bad Request", "message": "Status inválido. Valores aceitos: \"pendente\", \"pronto\", \"cancelado\"." }
```

E se o pedido não existir, `404`:

```bash
curl -i -X PATCH http://localhost:3000/orders/999/status \
  -H "Content-Type: application/json" \
  -d '{"status": "pronto"}'
```

### Apagar um pedido (DELETE /orders/:id)

```bash
curl -i -X DELETE http://localhost:3000/orders/2
```

Volta `204 No Content`, sem nada no corpo. Rodando o mesmo comando de novo, o pedido já não existe e volta `404`.

### Rota que não existe

```bash
curl -i http://localhost:3000/cardapio
curl -i -X PUT http://localhost:3000/orders/1
```

Os dois voltam `404`:

```json
{ "error": "Not Found", "message": "Rota não encontrada: GET /cardapio" }
```

## Sobre o código

Está tudo no [`server.js`](server.js), mais ou menos na ordem em que a requisição passa. A função `rotear` olha o método e o caminho e chama a função da rota (`listarPedidos`, `mostrarPedido`, `criarPedido`, `atualizarStatus` ou `removerPedido`). As respostas saem pelo `enviarJson` e pelo `enviarErro`, que já colocam o `Content-Type` e o `Content-Length`.

Algumas coisas que valem explicar:

- O body é lido com `req.on('data')` e `req.on('end')`. Eu guardo os pedaços como Buffer e só converto pra texto no final, porque um caractere com acento pode chegar partido entre dois pedaços.
- O `JSON.parse` fica dentro de um `try/catch`. Se mandarem um JSON quebrado, volta 400 e o servidor segue no ar. Também tem um `try/catch` em volta do roteamento, que responde 500 se acontecer algum erro que eu não previ.
- Body com mais de 1 MB recebe 413.
- No POST eu ignoro `id` e `status` se vierem no body, porque quem define isso é o servidor. No PATCH só o status muda.
- O `:id` tem que ser um inteiro positivo. Coisas como `abc` ou `0` dão 404, já que não existe pedido com esse id.
- `/orders/` com barra no final funciona igual a `/orders`.
- `GET /orders?status=xyz` devolve 200 com a lista vazia, porque na tabela da atividade essa rota só tem o 200.

O repositório tem só o `server.js`, o `package.json` (com o script `start` e sem dependências) e este README.
