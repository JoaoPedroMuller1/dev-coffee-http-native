// Dev Coffee API (AP2)
// API da fila de pedidos da cafeteria, feita só com o http nativo do Node, sem Express.
// Os pedidos ficam em memória: reiniciou o servidor, zerou tudo.

const http = require('node:http');
const { URL } = require('node:url');

const PORT = process.env.PORT || 3000;
const STATUS_VALIDOS = ['pendente', 'pronto', 'cancelado'];
const LIMITE_BODY = 1024 * 1024; // 1 MB, acima disso eu recuso

let pedidos = [];
let proximoId = 1; // nunca volta, então id de pedido apagado não é reaproveitado

function enviarJson(res, statusCode, dados, headersExtras) {
  const json = JSON.stringify(dados);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    // tem que ser o tamanho em bytes, não em caracteres ("é" ocupa 2 bytes)
    'Content-Length': Buffer.byteLength(json),
    ...headersExtras,
  });
  res.end(json);
}

function enviarErro(res, statusCode, message, details) {
  const corpo = { error: http.STATUS_CODES[statusCode], message };
  if (details) corpo.details = details;
  enviarJson(res, statusCode, corpo);
}

// Lê o body da requisição pelos eventos de stream, como a atividade pede.
// Se der problema, rejeita com { statusCode, message } e quem chamou devolve o erro.
function lerBody(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let tamanho = 0;
    let falhou = false;

    req.on('data', (chunk) => {
      if (falhou) return;

      tamanho += chunk.length;
      if (tamanho > LIMITE_BODY) {
        falhou = true;
        reject({ statusCode: 413, message: `O corpo da requisição excede o limite de ${LIMITE_BODY} bytes.` });
        return;
      }
      pedacos.push(chunk);
    });

    req.on('end', () => {
      if (falhou) return;

      // junto todos os pedaços e só depois converto pra texto.
      // se convertesse um por um, um "é" que chegou partido entre dois chunks ia virar lixo
      const texto = Buffer.concat(pedacos).toString('utf8');

      if (texto.trim() === '') {
        reject({ statusCode: 400, message: 'O corpo da requisição está vazio. Envie um JSON válido.' });
        return;
      }

      // sem esse try/catch, um JSON quebrado derrubava o servidor inteiro
      try {
        resolve(JSON.parse(texto));
      } catch (err) {
        reject({ statusCode: 400, message: 'JSON malformado no corpo da requisição.', details: [err.message] });
      }
    });

    req.on('error', (err) => {
      if (falhou) return;
      falhou = true;
      reject(err);
    });
  });
}

// JSON.parse aceita [] e null, então confiro se veio mesmo um objeto
function ehObjeto(valor) {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

// só aceito id inteiro positivo. "abc", "0", "1.5", "01"... nenhum pedido tem esse id, então dá 404
function buscarPedido(id) {
  if (!/^[1-9]\d*$/.test(id)) return null;
  return pedidos.find((p) => p.id === Number(id));
}

function pedidoNaoEncontrado(res, id) {
  enviarErro(res, 404, `Pedido com id "${id}" não encontrado.`);
}

function listarPedidos(res, query) {
  const status = query.get('status');

  if (status) {
    enviarJson(res, 200, pedidos.filter((p) => p.status === status));
  } else {
    enviarJson(res, 200, pedidos);
  }
}

function mostrarPedido(res, id) {
  const pedido = buscarPedido(id);
  if (!pedido) return pedidoNaoEncontrado(res, id);

  enviarJson(res, 200, pedido);
}

async function criarPedido(req, res) {
  const body = await lerBody(req);

  if (!ehObjeto(body)) {
    return enviarErro(res, 400, 'O corpo da requisição deve ser um objeto JSON.');
  }

  // junto todos os erros pra mostrar de uma vez, em vez de ir reclamando de um campo por vez
  const erros = [];
  for (const campo of ['client', 'item']) {
    const valor = body[campo];

    if (valor === undefined || valor === null) {
      erros.push(`O campo "${campo}" é obrigatório.`);
    } else if (typeof valor !== 'string') {
      erros.push(`O campo "${campo}" deve ser uma string.`);
    } else if (valor.trim() === '') {
      erros.push(`O campo "${campo}" não pode ser vazio.`);
    }
  }

  if (erros.length > 0) {
    return enviarErro(res, 400, 'Dados do pedido inválidos.', erros);
  }

  // id e status quem decide é o servidor, mesmo que o cliente mande esses campos
  const pedido = {
    id: proximoId++,
    client: body.client.trim(),
    item: body.item.trim(),
    status: 'pendente',
  };
  pedidos.push(pedido);

  enviarJson(res, 201, pedido, { Location: `/orders/${pedido.id}` });
}

async function atualizarStatus(req, res, id) {
  // primeiro vejo se o pedido existe, só depois olho o body
  const pedido = buscarPedido(id);
  if (!pedido) return pedidoNaoEncontrado(res, id);

  const body = await lerBody(req);

  if (!ehObjeto(body)) {
    return enviarErro(res, 400, 'O corpo da requisição deve ser um objeto JSON.');
  }
  if (body.status === undefined || body.status === null) {
    return enviarErro(res, 400, 'O campo "status" é obrigatório.');
  }
  if (!STATUS_VALIDOS.includes(body.status)) {
    return enviarErro(res, 400, 'Status inválido. Valores aceitos: "pendente", "pronto", "cancelado".');
  }

  // essa rota só mexe no status, o resto do body eu ignoro
  pedido.status = body.status;
  enviarJson(res, 200, pedido);
}

function removerPedido(res, id) {
  const pedido = buscarPedido(id);
  if (!pedido) return pedidoNaoEncontrado(res, id);

  pedidos = pedidos.filter((p) => p !== pedido);

  // a atividade pede 204 sem corpo, então aqui não vai nem Content-Type
  res.writeHead(204);
  res.end();
}

async function rotear(req, res) {
  let url;
  try {
    // req.url vem só com caminho e query, por isso a base "http://localhost"
    url = new URL(req.url, 'http://localhost');
  } catch {
    return enviarErro(res, 400, 'URL da requisição inválida.');
  }

  // tiro a barra do final pra /orders/ funcionar igual a /orders
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  const partes = caminho.split('/').slice(1); // "/orders/1/status" vira ['orders', '1', 'status']
  const metodo = req.method;

  if (partes[0] === 'orders') {
    if (partes.length === 1) {
      if (metodo === 'GET') return listarPedidos(res, url.searchParams);
      if (metodo === 'POST') return criarPedido(req, res);
    }

    if (partes.length === 2) {
      if (metodo === 'GET') return mostrarPedido(res, partes[1]);
      if (metodo === 'DELETE') return removerPedido(res, partes[1]);
    }

    if (partes.length === 3 && partes[2] === 'status' && metodo === 'PATCH') {
      return atualizarStatus(req, res, partes[1]);
    }
  }

  // qualquer rota ou verbo que não caiu em nenhum if acima
  enviarErro(res, 404, `Rota não encontrada: ${metodo} ${caminho}`);
}

const server = http.createServer(async (req, res) => {
  res.on('finish', () => {
    console.log(`${req.method} ${req.url} -> ${res.statusCode}`);
  });

  try {
    await rotear(req, res);
  } catch (err) {
    // se a resposta já começou a sair, não dá mais pra mandar um erro bonito
    if (res.headersSent) return res.destroy();

    if (err.statusCode) {
      // erros que eu mesmo lancei no lerBody (400, 413)
      enviarErro(res, err.statusCode, err.message, err.details);
    } else {
      console.error(err);
      enviarErro(res, 500, 'Erro interno no servidor.');
    }
  }
});

// quando chega algo que nem é HTTP válido, o Node cai aqui.
// respondo 400 em JSON em vez de só fechar a conexão
server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;

  const json = JSON.stringify({ error: 'Bad Request', message: 'Requisição HTTP malformada.' });
  socket.end(
    'HTTP/1.1 400 Bad Request\r\n' +
      'Content-Type: application/json; charset=utf-8\r\n' +
      `Content-Length: ${Buffer.byteLength(json)}\r\n` +
      'Connection: close\r\n' +
      '\r\n' +
      json,
  );
});

server.listen(PORT, () => {
  console.log(`Dev Coffee API rodando em http://localhost:${PORT}`);
});
