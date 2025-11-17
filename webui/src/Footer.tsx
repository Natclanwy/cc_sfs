import { createSignal, onMount } from 'solid-js'

function Footer() {
  const [fwVersion, setFwVersion] = createSignal<string>('')
  const [chip, setChip] = createSignal<string>('')
  const [buildDate, setBuildDate] = createSignal<string>('')
  const [buildTime, setBuildTime] = createSignal<string>('')
  const [uiHash, setUiHash] = createSignal<string>('')

  onMount(async () => {
    // Extract the UI bundle hash from the index script tag
    try {
      const scripts = Array.from(document.getElementsByTagName('script'))
      const entry = scripts.find(s => (s as HTMLScriptElement).src?.includes('/assets/index-') && (s as HTMLScriptElement).src.endsWith('.js')) as HTMLScriptElement | undefined
      if (entry && entry.src) {
        const match = new URL(entry.src, window.location.href).pathname.match(/index-([A-Za-z0-9_-]+)\.js$/)
        if (match && match[1]) setUiHash(match[1])
      }
    } catch {}

    // Fetch firmware version info from the device
    try {
      const res = await fetch('/version')
      if (res.ok) {
        const data = await res.json()
        if (data.firmware_version) setFwVersion(data.firmware_version)
        if (data.chip_family) setChip(data.chip_family)
        if (data.build_date) setBuildDate(data.build_date)
        if (data.build_time) setBuildTime(data.build_time)
      }
    } catch (e) {
      // Non-blocking footer; ignore errors
      console.debug('Footer version fetch failed', e)
    }
  })

  return (
    <div class="w-full max-w-5xl text-right text-xs opacity-60 mt-4 select-none">
      <span>Firmware: {fwVersion() || 'unknown'}{chip() ? ` (${chip()})` : ''}</span>
      <span class="mx-2">•</span>
      <span>Build: {buildDate()}{buildTime() ? ` ${buildTime()}` : ''}</span>
      {uiHash() && <>
        <span class="mx-2">•</span>
        <span>UI: {uiHash()}</span>
      </>}
    </div>
  )
}

export default Footer
