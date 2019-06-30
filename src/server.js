const utls = require('./utls')

class SoNetRpcServer {
  constructor(props) {
    this.socketServer = props.socketServer
    this.failTimeout = props.defaultTimeout || 60000

    this.connectedClients = []
    this.registeredCallbacks = {}

    this.onConnectMW = []
    this.onDisconnectMW = []
    this.incMW = []
    this.incReturnMW = []
    this.outMW = []
    this.outAfterMW = []

    this.socketServer.on('connection', async (socket) => {
      let shouldBreak = false
      const $break = () => shouldBreak = true
      for (let action of this.onConnectMW) {
        await action(socket, $break)
      }
      if (shouldBreak) {
        socket.close()
        return
      }
      await this.onClientConnect(socket)
    })
  }

  /**
   *
   * Middleware - object with install method or function
   * function has Server and Props arguments
   *
   * Each of callbacks will receive $break method which will stop execution of the process
   * - onConnect (socketObject (depends on the chose socketServer), $break) break method will stop connection between socket and server
   * - onDisconnect (socketId, $break) break method will prevent removing socket from connected sockets
   * - onIncoming (socket, packet, $break) - called right after the packet has been received (no callbacks had been called yet)
   *    * - $break will stop execution of emit of cmd
   *    * - packet contains info about called function
   *    * - socket contains info about the called
   *    * - You can return new packet as a return. Please be sure to save the same packet id. Or you must really know wtf you are doing
   * - onIncomingReturn (socket, packet, nPacket, res, $break)
   *    * - socket --||--
   *    * - packet - initial received packet
   *    * - nPacket - actual packet that has been passed to the callback execution
   *    * - res - result of callbacks execution
   *    * - $break - stops function execution (no socket event will be emitted)
   */

  use(middleware, props) {
    if (typeof middleware === 'function') {
      middleware(this, props)
    } else if (typeof middleware === 'object') {
      middleware.install(this, props)
    } else {
      throw new Error('Middleware is not a function or an object with install method')
    }
  }

  addOnConnectMiddleware(action) { // done
    this.onConnectMW.push(action)
  }

  addOnDisconnectMiddleware(action) { // done
    this.onDisconnectMW.push(action)
  }

  addIncomingPacketMiddleware(action) { // done
    this.incMW.push(action)
  }

  addIncomingPacketReturnMiddleware(action) { // done
    this.incReturnMW.push(action)
  }

  addOutcoimgMiddleware(action) {
    this.outMW.push(action)
  }

  addOutcomingAfterMiddleware(action) {
    this.outAfterMW.push(action)
  }

  async onClientConnect(socket) {
    this.connectedClients.push(await this._createClientFromSocket(socket))
    socket.on('disconnect', async () => {
      let shouldBreak = false
      let $break = () => shouldBreak = true
      for (let action of this.onDisconnectMW) {
        await action(socket.id, $break)
      }
      if (shouldBreak) return
      this._removeClientById(socket.id)
    })
  }


  async broadcast(eventName, ...args) {
    const results = []
    let promises = []
    this.connectedClients.forEach((el) => {
      let promise = new Promise(async (resolve) => {
        try {
          let res = await this.fire(eventName, el, ...args)
          results.push(res)
          resolve()
        } catch (e) {
          resolve()
        }
      })
      promises.push(promise)
    })
    await Promise.all(promises)
    return results
  }

  async $broadcast(settings, ...args) {
    if (!settings.eventName || !settings.failTimeout) throw new Error('Invalid settings object')
    const results = []
    let promises = []
    this.connectedClients.forEach((el) => {
      let promise = new Promise(async (resolve) => {
        try {
          let res = await this.$fire({...settings, client: el}, ...args)
          results.push(res)
          resolve()
        } catch (e) {
          resolve()
        }
      })
      promises.push(promise)
    })
    await Promise.all(promises)
    return results
  }

  async fire(eventName, client, ...args) {
    const {id, packet} = utls.createReqPacket('server', eventName, args)
    const pr = new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error('Request timeout'))
      }, this.failTimeout)

      client.socket.once(`${id}`, (packet) => {
        clearTimeout(timerId)
        if (!packet.status) {
          reject(new Error(packet.error))
          return
        }
        if (packet.id !== id) {
          reject(new Error('Packet id miss match'))
          return
        }
        resolve(packet.result)
      })
    })
    client.socket.emit('server-packet', packet)
    return await pr
  }

  async $fire(settings, args) {
    if (!settings.client || !settings.failTimeout || !settings.eventName) {
      throw new Error('Invalid settings object')
    }
    const {id, packet} = utls.createReqPacket('server', settings.eventName, args)
    const pr = new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error('Request timeout'))
      }, settings.failTimeout)

      settings.client.socket.once(`${id}`, (packet) => {
        clearTimeout(timerId)
        if (!packet.status) {
          reject(new Error(packet.error))
          return
        }
        if (packet.id !== id) {
          reject(new Error('Packet id missmatch'))
          return
        }
        resolve(packet.result)
      })
    })
    settings.client.socket.emit('server-packet', packet)
    return await pr
  }

  register(eventName, callback) {
    if (this.registeredCallbacks[eventName]) throw new Error(`Callback for ${eventName} has already been registered. It will be redefined.`)
    this.registeredCallbacks[eventName] = callback
  }

  // ----------- Private --------------

  async _createClientFromSocket(socket) {
    socket.on('client-packet', async (packet) => {
      await this._setupIncomingPacketHandler(socket, packet)
    })
    return {
      socket,
    }
  }

  _removeClientById(id) {
    this.connectedClients.splice(this.connectedClients.findIndex(el => el.socket.id === id), 1)
  }

  _getClientById(id) {
    return this.connectedClients.find(el => el.socket.id === id)
  }

  async _setupIncomingPacketHandler(socket, packet) {
    const {from, eventName, args, id} = packet
    if (from !== 'client') {
      socket.emit(`${id}`, utls.createResPacket(id, false, '500', null))
      return
    }
    if (!this.registeredCallbacks[eventName]) {
      socket.emit(`${id}`, utls.createResPacket(id, false, `No ${eventName} handler`, null))
      return
    }
    try {

      let shouldBreak = false
      let nPacket = null
      let $break = () => shouldBreak = true
      for (let action of this.incMW) {
        nPakcet = await action(socket, packet, $break)
      }

      if (shouldBreak) { // break if $break has been called
        return
      }

      if (nPacket) {
        packet = nPacket
      }

      let res = await this.registeredCallbacks[packet.eventName](...packet.args, this._getClientById(socket.id))

      let shouldBreak2 = false
      let nRes = null
      $break = () => shouldBreak2 = true
      for (let action of this.incReturnMW) {
        nRes = await action(socket, packet, nPacket, res, $break)
      }

      if (shouldBreak2) return
      if (nRes) res = nRes

      const pkg = utls.createResPacket(id, true, null, res)
      socket.emit(`${id}`, pkg)
    } catch (e) {
      socket.emit(`${id}`, utls.createResPacket(id, false, e.message, null))
    }
  }
}


module.exports = SoNetRpcServer
