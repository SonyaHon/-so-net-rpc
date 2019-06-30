const Client = require('./src/client')
const VuePlugin = (Vue, props) => {
  const api = new Client(props)
  if (window) {
    window.$api = api
  }
  Vue.prototype.$api = api
}


module.exports = {
  Client,
  VuePlugin
}