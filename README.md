# RPC
Socket io based websocket rpc
## Set up
### Server
```js
const http = require('http')
const socketIo = require('socket.io')
const express = require('express')
const parser = require('socket.io-msgpack-parser')
const RPC = requrie('@so-net/rpc/rpc-node')

const app = express()
const httpServer = http.createServer(app)
const ioServer = socketIo(httpServer, {parser})

const server = new RPC.Server({socketServer: ioServer})
```
`server` is set and ready to be used
#### Setting callbacks
```js
server.register('some-event-name', async (arg1, client) => {
  console.log(client.socket.id) // client is server client object (basicly you need only client.socket)
  return arg1 + 'Hello world' // return will be passed to the client
})
```
#### Firing event from server (targeted)
```js
const res = await server.fire('event-name', client, arg1)
console.log(res) // res is something returned  from client
```
#### Firing event from server (broadcast)
```js
const res = await server.broadcast('event-name', agr1, arg2)
console.log(res) // res = [client1Reply, client2Reply]
```

### Client
#### Node
```js
const RPC = require('@so-net/rpc/rpc-node')
const client = new RPC.Client({socket: ioClient({parser})})
```
#### Web
```js
const RPC = require('@so-net/rpc/rpc-web-client')
const client = new RPC.Client({socket: ioClient({parser})})
```
#### Vue plugin
```js
const RPC = require('@so-net/rpc/rpc-web-client')
Vue.use(RPC.VuePlugin, {
  socket: ioClient({parser})
}) 
// window $api will be created
// vm.$api will be created
```
#### Setting callbacks
```js
client.register('event-name', async (arg1, arg2) => {
  return  arg1 + arg2
})
```
#### Firing events
```js
const res = await client.fire('event-name', arg1, arg2)
console.log(res) // res - server response
```
## Middlewares
Docs for middlewares will be created after they all will be done
## Sessions
```js
const session = require("express-session")({ // lookup docs for express-session
	saveUninitialized: true
})
const sharedsession = require("express-socket.io-session") // lookup docs for express-socket.io-session
app.use(session)
ioServer.use(sharedsession(session))
server.register('event-name', async (data, client) => {
   let session = client.socket.handshake.session
   ...
})
```
You can use any implementation of sessions for socket.io and/or express
## To be done
* Add all middlewares (50% done)
* E2E crypto via configuration
* Set of ready to use middlewares (like logger, etc)