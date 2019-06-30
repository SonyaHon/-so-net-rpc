const {createReqPacket, createResPacket} = require('./utls')

class SoNetRpcClient {
  constructor(props) {
    this.socket = props.socket
    this.failTimeout = props.defaultTimeout || 60000
    this.registeredCallbacks = {}
    this.socket.on('server-packet', async (packet) => {
      await this._setupIncomingPacketHandler(packet)
    })
  }

  async fire(eventName, ...args) {
    const {id, packet} = createReqPacket('client', eventName, args)
    const pr = new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error('Request timeout'))
      }, this.failTimeout)

      this.socket.once(`${id}`, (packet) => {
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
    this.socket.emit('client-packet', packet)
    return await pr
  }

  async $fire(settings, ...args) {
    if (!settings.eventName || !settings.failTimeout) throw new Error('Invalid settings object')
    const {id, packet} = createReqPacket('client', settings.eventName, args)
    const pr = new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        reject(new Error('Request timeout'))
      }, settings.failTimeout)

      this.socket.once(`${id}`, (packet) => {
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
    this.socket.emit('client-packet', packet)
    return await pr
  }

  register(eventName, callback) {
    if (this.registeredCallbacks[eventName]) throw new Error(`Callback for ${eventName} has already been registered. It will be redefined.`)
    this.registeredCallbacks[eventName] = callback
  }

  // ----- PRIVATE ---------
  async _setupIncomingPacketHandler(packet) {
    const {from, eventName, args, id} = packet
    if (from !== 'server') {
      this.socket.emit(`${id}`, createResPacket(id, false, '500', null))
      return
    }
    if (!this.registeredCallbacks[eventName]) {
      this.socket.emit(`${id}`, createResPacket(id, false, `No ${eventName} handler`, null))
      return
    }
    try {
      const res = await this.registeredCallbacks[eventName](...args)
      const packet = createResPacket(id, true, null, res)
      this.socket.emit(`${id}`, packet)
    } catch (e) {
      this.socket.emit(`${id}`, createResPacket(id, false, e.message, null))
    }
  }
}

module.exports = SoNetRpcClient