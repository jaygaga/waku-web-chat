'use strict'

// Libp2p Core
const Libp2p = require('libp2p')
// Transports
const TCP = require('libp2p-tcp')
const Websockets = require('libp2p-websockets')
const WebrtcStar = require('libp2p-webrtc-star')
const wrtc = require('wrtc')
// Stream Muxer
const Mplex = require('libp2p-mplex')
// Connection Encryption
const { NOISE } = require('libp2p-noise')
const Secio = require('libp2p-secio')
// Chat over Pubsub
const PubsubChat = require('./chat')
// Peer Discovery
const Bootstrap = require('libp2p-bootstrap')
const MDNS = require('libp2p-mdns')
const KadDHT = require('libp2p-kad-dht')
// PubSub implementation
const Gossipsub = require('libp2p-gossipsub')
// Multiaddress
const multiaddr = require('multiaddr')

;(async () => {
  // Create the Node
  //
  const libp2p = await Libp2p.create({
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/0',
        '/ip4/0.0.0.0/tcp/0/ws',
        `/ip4/127.0.0.1/tcp/15555/ws/p2p-webrtc-star/`
      ]
    },
    modules: {
      transport: [ TCP, Websockets, WebrtcStar ],
      streamMuxer: [ Mplex ],
      connEncryption: [ NOISE, Secio ],
      peerDiscovery: [ Bootstrap, MDNS ],
      dht: KadDHT,
      pubsub: Gossipsub
    },
    config: {
      transport : {
        [WebrtcStar.prototype[Symbol.toStringTag]]: {
          wrtc
        }
      },
      peerDiscovery: {
        bootstrap: {
          list: [ '/ip4/127.0.0.1/tcp/63785/ipfs/QmWjz6xb8v9K4KnYEwP5Yk75k5mMBCehzWFLCvvQpYxF3d' ]
        }
      },
      dht: {
        enabled: true,
        randomWalk: {
          enabled: true
        }
      },
      pubsub: {
        enabled: true,
        emitSelf: true,
        signMessages: false,
        strictSigning: false
      }
    }
  })

  // Listen on libp2p for `peer:connect` and log the provided connection.remotePeer.toB58String() peer id string.
  libp2p.connectionManager.on('peer:connect', (connection) => {
    console.info(`Connected to ${connection.remotePeer.toB58String()}!`)
  })

    // Start libp2p
  await libp2p.start()

  console.log('listening on addresses:')
  libp2p.multiaddrs.forEach(addr => {
    console.log(`${addr.toString()}/p2p/${libp2p.peerId.toB58String()}`)
  })

  console.log('\nNode supports protocols:')
  libp2p.upgrader.protocols.forEach((_, p) => console.log(p))

  const codec = "/vac/waku/relay/2.0.0-beta1"

  //    Dial nim-waku
  if (process.argv.length >= 3) {
    const ma = multiaddr(process.argv[2])
    console.log(`dialing remote peer at ${process.argv[2]}`)
    await libp2p.dialProtocol(ma, codec)
    console.log(`dialed ${process.argv[2]}`)
  }

  // Create our PubsubChat client
  const pubsubChat = new PubsubChat(libp2p, PubsubChat.TOPIC, ({ from, message }) => {
    let fromMe = from === libp2p.peerId.toB58String()
    let user = from.substring(0, 6)
    if (pubsubChat.userHandles.has(from)) {
      user = pubsubChat.userHandles.get(from)
    }
    console.info(`${fromMe ? PubsubChat.CLEARLINE : ''}${user}(${new Date(message.created).toLocaleTimeString()}): ${message.data}`)
  })

  // Set up our input handler
  process.stdin.on('data', async (message) => {
    // Remove trailing newline
    message = message.slice(0, -1)
    // If there was a command, exit early
    if (pubsubChat.checkCommand(message)) return

    try {
      // Publish the message
      await pubsubChat.send(message)
    } catch (err) {
      console.error('Could not publish chat', err)
    }
  })
})()
