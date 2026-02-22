/*! streamsaver. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */

/* global chrome location ReadableStream define MessageChannel TransformStream */

;((name, definition) => {
  typeof module !== 'undefined'
    ? module.exports = definition()
    : typeof define === 'function' && typeof define.amd === 'object'
      ? define(definition)
      : this[name] = definition()
})('streamSaver', () => {
  'use strict'

  const global = typeof window === 'object' ? window : this
  if (!global.HTMLElement) console.warn('streamsaver is meant to run on browsers main thread')

  let mitmTransporter = null
  let supportsTransferable = false
  const test = fn => { try { fn() } catch (e) {} }
  const ponyfill = global.WebStreamsPolyfill || {}
  const isSecureContext = global.isSecureContext
  // TODO: Must come up with a real detection test (#69)
  let useBlobFallback = /constructor/i.test(global.HTMLElement) || !!global.safari || !!global.WebKitPoint
  const downloadStrategy = isSecureContext || 'MozAppearance' in document.documentElement.style
    ? 'iframe'
    : 'navigate'

  const streamSaver = {
    createWriteStream,
    WritableStream: global.WritableStream || ponyfill.WritableStream,
    supported: true,
    version: { full: '2.0.5', major: 2, minor: 0, dot: 5 },
    mitm: 'https://jimmywarting.github.io/StreamSaver.js/mitm.html?version=2.0.0'
  }

  /**
   * create a hidden iframe and append it to the DOM (body)
   *
   * @param  {string} src page to load
   * @return {HTMLIFrameElement} page to load
   */
  function makeIframe (src) {
    if (!src) throw new Error('meh')
    const iframe = document.createElement('iframe')
    iframe.hidden = true
    iframe.src = src
    iframe.loaded = false
    iframe.name = 'iframe'
    iframe.isIframe = true
    iframe.postMessage = (...args) => iframe.contentWindow.postMessage(...args)
    iframe.addEventListener('load', () => {
      iframe.loaded = true
    }, { once: true })
    document.body.appendChild(iframe)
    return iframe
  }

  /**
   * create a popup that simulates the basic things
   * of what a iframe can do
   *
   * @param  {string} src page to load
   * @return {object}     iframe like object
   */
  function makePopup (src) {
    const options = 'width=200,height=100'
    const delegate = document.createDocumentFragment()
    const popup = {
      frame: global.open(src, 'popup', options),
      loaded: false,
      isIframe: false,
      isPopup: true,
      remove () { popup.frame.close() },
      addEventListener (...args) { delegate.addEventListener(...args) },
      dispatchEvent (...args) { delegate.dispatchEvent(...args) },
      removeEventListener (...args) { delegate.removeEventListener(...args) },
      postMessage (...args) { popup.frame.postMessage(...args) }
    }

    const onReady = evt => {
      if (evt.source === popup.frame) {
        popup.loaded = true
        global.removeEventListener('message', onReady)
        popup.dispatchEvent(new Event('load'))
      }
    }

    global.addEventListener('message', onReady)

    return popup
  }

  try {
    // We can't look for service worker since it may still work on http
    new Response(new ReadableStream())
    if (isSecureContext && !('serviceWorker' in navigator)) {
      useBlobFallback = true
    }
  } catch (err) {
    useBlobFallback = true
  }

  test(() => {
    // Transferable stream was first enabled in chrome v73 behind a flag
    const { readable } = new TransformStream()
    const mc = new MessageChannel()
    mc.port1.postMessage(readable, [readable])
    mc.port1.close()
    mc.port2.close()
    supportsTransferable = true
    // Freeze TransformStream object (can only work with native)
    Object.defineProperty(streamSaver, 'TransformStream', {
      configurable: false,
      writable: false,
      value: TransformStream
    })
  })

  function loadTransporter () {
    if (!mitmTransporter) {
      mitmTransporter = isSecureContext
        ? makeIframe(streamSaver.mitm)
        : makePopup(streamSaver.mitm)
    }
  }

  /**
   * @param  {string} filename filename that should be used
   * @param  {object} options  [description]
   * @param  {number} size     deprecated
   * @return {WritableStream<Uint8Array>}
   */
  function createWriteStream (filename, options, size) {
    let opts = {
      size: null,
      pathname: null,
      writableStrategy: undefined,
      readableStrategy: undefined
    }

    let bytesWritten = 0 // by StreamSaver.js (not the service worker)
    let downloadUrl = null
    let channel = null
    let ts = null

    // normalize arguments
    if (Number.isFinite(options)) {
      [ size, options ] = [ options, size ]
      console.warn('[StreamSaver] Deprecated pass an object as 2nd argument when creating a write stream')
      opts.size = size
      opts.writableStrategy = options
    } else if (options && options.highWaterMark) {
      console.warn('[StreamSaver] Deprecated pass an object as 2nd argument when creating a write stream')
      opts.size = size
      opts.writableStrategy = options
    } else {
      opts = options || {}
    }
    if (!useBlobFallback) {
      loadTransporter()

      channel = new MessageChannel()

      // Make filename RFC5987 compatible
      filename = encodeURIComponent(filename.replace(/\//g, ':'))
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A')

      const response = {
        transferringReadable: supportsTransferable,
        pathname: opts.pathname || Math.random().toString().slice(-6) + '/' + filename,
        headers: {
          'Content-Type': 'application/octet-stream; charset=utf-8',
          'Content-Disposition': "attachment; filename*=UTF-8''" + filename
        }
      }

      if (opts.size) {
        response.headers['Content-Length'] = opts.size
      }

      const args = [ response, '*', [ channel.port2 ] ]

      if (supportsTransferable) {
        const transformer = downloadStrategy === 'iframe' ? undefined : {
          // This transformer & flush method is only used by insecure context.
          transform (chunk, controller) {
            if (!(chunk instanceof Uint8Array)) {
              throw new TypeError('Can only write Uint8Arrays')
            }
            bytesWritten += chunk.length
            controller.enqueue(chunk)

            if (downloadUrl) {
              location.href = downloadUrl
              downloadUrl = null
            }
          },
          flush () {
            if (downloadUrl) {
              location.href = downloadUrl
            }
          }
        }
        ts = new streamSaver.TransformStream(
          transformer,
          opts.writableStrategy,
          opts.readableStrategy
        )
        const readableStream = ts.readable

        channel.port1.postMessage({ readableStream }, [ readableStream ])
      }

      channel.port1.onmessage = evt => {
        // Service worker sent us a link that we should open.
        if (evt.data.download) {
          // Special treatment for popup...
          if (downloadStrategy === 'navigate') {
            mitmTransporter.remove()
            mitmTransporter = null
            if (bytesWritten) {
              location.href = evt.data.download
            } else {
              downloadUrl = evt.data.download
            }
          } else {
            if (mitmTransporter.isPopup) {
              mitmTransporter.remove()
              mitmTransporter = null
              // Special case for firefox, they can keep sw alive with fetch
              if (downloadStrategy === 'iframe') {
                makeIframe(streamSaver.mitm)
              }
            }

            // We never remove this iframes b/c it can interrupt saving
            makeIframe(evt.data.download)
          }
        } else if (evt.data.abort) {
          chunks = []
          channel.port1.postMessage('abort') //send back so controller is aborted
          channel.port1.onmessage = null
          channel.port1.close()
          channel.port2.close()
          channel = null
        }
      }

      if (mitmTransporter.loaded) {
        mitmTransporter.postMessage(...args)
      } else {
        mitmTransporter.addEventListener('load', () => {
          mitmTransporter.postMessage(...args)
        }, { once: true })
      }
    }

    let chunks = []

    return (!useBlobFallback && ts && ts.writable) || new streamSaver.WritableStream({
      write (chunk) {
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError('Can only write Uint8Arrays')
        }
        if (useBlobFallback) {
          // Safari... The new IE6
          // https://github.com/jimmywarting/StreamSaver.js/issues/69
          //
          // even though it has everything it fails to download anything
          // that comes from the service worker..!
          chunks.push(chunk)
          return
        }

        // is called when a new chunk of data is ready to be written
        // to the underlying sink. It can return a promise to signal
        // success or failure of the write operation. The stream
        // implementation guarantees that this method will be called
        // only after previous writes have succeeded, and never after
        // close or abort is called.

        // TODO: Kind of important that service worker respond back when
        // it has been written. Otherwise we can't handle backpressure
        // EDIT: Transferable streams solves this...
        channel.port1.postMessage(chunk)
        bytesWritten += chunk.length

        if (downloadUrl) {
          location.href = downloadUrl
          downloadUrl = null
        }
      },
      close () {
        if (useBlobFallback) {
          const blob = new Blob(chunks, { type: 'application/octet-stream; charset=utf-8' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = filename
          link.click()
        } else {
          channel.port1.postMessage('end')
        }
      },
      abort () {
        chunks = []
        channel.port1.postMessage('abort')
        channel.port1.onmessage = null
        channel.port1.close()
        channel.port2.close()
        channel = null
      }
    }, opts.writableStrategy)
  }

  return streamSaver
})
