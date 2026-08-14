# Lista de clientes para o Meta

`converter-publico.js` transforma o export do Cardapio Web no formato de Publico
Personalizado do Meta.

    node converter-publico.js clientes.csv publico-meta.csv

Colunas de saida: phone, email, fn, ln, ct, st, zip, country, value.
Telefone sai como 55 + DDD + numero. Acentos removidos, tudo minusculo.

O Meta faz o hash SHA-256 no navegador antes do envio. O arquivo gerado sai em
texto puro: nao versionar, nao mandar por e-mail, apagar depois de subir.
