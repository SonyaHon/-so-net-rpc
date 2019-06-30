const {uuid} = require('@so-net/utils')

function createReqPacket(from, eventName, args) {
  const id = uuid()
  return {
    id,
    packet: {
      id,
      from,
      eventName,
      args,
    },
  }
}

function createResPacket(id, status, error, result) {
  return {
    id,
    status,
    error,
    result,
  }
}

module.exports = {
  createReqPacket,
  createResPacket,
}