import { createLibp2p } from 'libp2p'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { Mplex } from '@libp2p/mplex'
import { createPeerId } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'
import * as Digest from 'multiformats/hashes/digest'
import { fromString } from 'uint8arrays/from-string'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { Minibus } from '@web3-storage/minibus'
// import { enable } from '@libp2p/logger'
// enable('libp2p*')

export default {
  /**
   * @param {Request} request
   * @param {import('./bindings').Env} env
   */
  async fetch (request, env) {
    validateEnv(env)

    const { Noise } = await import('@chainsafe/libp2p-noise')
    const peerId = createPeerId({
      type: env.PEER_TYPE || 'Ed25519',
      multihash: Digest.decode(fromString(env.PEER_ID, 'base58btc')),
      privateKey: fromString(env.PEER_PRIVATE_KEY, 'base64pad')
    })
    // @ts-ignore Cannot assign to 'publicKey' because it is a read-only property.
    peerId.publicKey = peerId.multihash.digest
    const listenAddr = env.LISTEN_ADDR
    const wsTransport = new WebSockets()
    const node = await createLibp2p({
      peerId,
      addresses: { listen: [listenAddr] },
      // @ts-ignore Needs https://github.com/alanshaw/cf-libp2p-ws-transport/issues/1
      transports: [wsTransport],
      streamMuxers: [new Mplex()],
      connectionEncryption: [new Noise()]
    })

    const minibus = new Minibus({
      endpoint: env.MINIBUS_API_URL,
      headers: { Authorization: `Basic ${env.MINIBUS_BASIC_AUTH}` },
      // @ts-ignore needs fetch from worker scope. globalThis fetch errors with TypeError: Illegal invocation
      fetch: (...args) => fetch(...args)
    })
    const miniswap = new Miniswap(minibus)

    node.handle(BITSWAP_PROTOCOL, miniswap.handler)
    await node.start()

    const listener = wsTransport.listenerForMultiaddr(multiaddr(listenAddr))
    if (!listener) {
      throw new Error(`No listener for provided listen address ${env.LISTEN_ADDR}`)
    }

    return listener.handleRequest(request)
  }
}

/**
 * @param {import('./bindings').Env} env
 */
function validateEnv (env) {
  if (!env.PEER_ID) {
    throw new Error('PEER_ID env var is required')
  }

  if (!env.PEER_PRIVATE_KEY) {
    throw new Error('PEER_PRIVATE_KEY env var is required')
  }

  if (!env.LISTEN_ADDR) {
    throw new Error('LISTEN_ADDR env var is required')
  }

  if (!env.MINIBUS_BASIC_AUTH) {
    throw new Error('MINIBUS_BASIC_AUTH env var is required')
  }
}
