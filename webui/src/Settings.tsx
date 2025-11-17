import { createSignal, onMount } from 'solid-js'

function Settings() {
  const [ssid, setSsid] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [elegooip, setElegooip] = createSignal('')
  const [timeout, setTimeoutValue] = createSignal<number | string>(2000)
  const [firstLayerTimeout, setFirstLayerTimeout] = createSignal<number | string>(4000)
  const [startPrintTimeout, setStartPrintTimeout] = createSignal<number | string>(10000)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [saveSuccess, setSaveSuccess] = createSignal(false)
  const [apMode, setApMode] = createSignal<boolean | null>(null);
  const [pauseOnRunout, setPauseOnRunout] = createSignal(true);
  const [enabled, setEnabled] = createSignal(true);
  const [invalidFields, setInvalidFields] = createSignal<string[]>([]);
  // Load settings from the server and scan for WiFi networks
  onMount(async () => {
    try {
      setLoading(true)

      // Load settings
      const response = await fetch('/get_settings')
      if (!response.ok) {
        throw new Error(`Failed to load settings: ${response.status} ${response.statusText}`)
      }
      const settings = await response.json()

      setSsid(settings.ssid || '')
      // Password won't be loaded from server for security
      setPassword('')
      setElegooip(settings.elegooip || '')
      setTimeoutValue(settings.timeout || 2000)
      setFirstLayerTimeout(settings.first_layer_timeout || 4000)
      setStartPrintTimeout(settings.start_print_timeout || 10000)
      setApMode(settings.ap_mode || null)
      setPauseOnRunout(settings.pause_on_runout !== undefined ? settings.pause_on_runout : true)
      setEnabled(settings.enabled !== undefined ? settings.enabled : true)

      setError('')
    } catch (err: any) {
      setError(`Error loading settings: ${err.message || 'Unknown error'}`)
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  })


  const handleSave = async () => {
    try {
      setSaveSuccess(false)
      setError('')
      setInvalidFields([])

      // Validate all numeric fields are present and in correct range
      const errors: string[] = []
      const invalid: string[] = []

      const timeoutVal = timeout()
      if (timeoutVal === '' || timeoutVal === undefined) {
        errors.push('Movement Sensor Timeout is required')
        invalid.push('timeout')
      } else if (typeof timeoutVal === 'number' && (timeoutVal < 100 || timeoutVal > 30000)) {
        errors.push(`Movement Sensor Timeout must be between 100 and 30000 ms (current: ${timeoutVal})`)
        invalid.push('timeout')
      }

      const firstLayerTimeoutVal = firstLayerTimeout()
      if (firstLayerTimeoutVal === '' || firstLayerTimeoutVal === undefined) {
        errors.push('First Layer Timeout is required')
        invalid.push('firstLayerTimeout')
      } else if (typeof firstLayerTimeoutVal === 'number' && (firstLayerTimeoutVal < 100 || firstLayerTimeoutVal > 60000)) {
        errors.push(`First Layer Timeout must be between 100 and 60000 ms (current: ${firstLayerTimeoutVal})`)
        invalid.push('firstLayerTimeout')
      }

      const startPrintTimeoutVal = startPrintTimeout()
      if (startPrintTimeoutVal === '' || startPrintTimeoutVal === undefined) {
        errors.push('Start Print Timeout is required')
        invalid.push('startPrintTimeout')
      } else if (typeof startPrintTimeoutVal === 'number' && (startPrintTimeoutVal < 1000 || startPrintTimeoutVal > 60000)) {
        errors.push(`Start Print Timeout must be between 1000 and 60000 ms (current: ${startPrintTimeoutVal})`)
        invalid.push('startPrintTimeout')
      }

      if (errors.length > 0) {
        setInvalidFields(invalid)
        setError(errors.join('\n'))
        return
      }

      const settings = {
        ssid: ssid(),
        passwd: password(),
        ap_mode: false,
        elegooip: elegooip(),
        timeout: typeof timeoutVal === 'string' ? parseInt(timeoutVal) : timeoutVal,
        first_layer_timeout: typeof firstLayerTimeoutVal === 'string' ? parseInt(firstLayerTimeoutVal) : firstLayerTimeoutVal,
        pause_on_runout: pauseOnRunout(),
        start_print_timeout: typeof startPrintTimeoutVal === 'string' ? parseInt(startPrintTimeoutVal) : startPrintTimeoutVal,
        enabled: enabled(),
      }

      let lastError = ''
      let saved = false
      const maxRetries = 3

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch('/update_settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const responseData = await response.json()

          if (!responseData.success) {
            throw new Error('Server reported save failure')
          }

          // Validate that settings were actually saved by checking key values
          const mismatch = []
          if (responseData.settings.timeout !== timeoutVal) {
            mismatch.push(`timeout (got ${responseData.settings.timeout}, expected ${timeoutVal})`)
          }
          if (responseData.settings.first_layer_timeout !== firstLayerTimeoutVal) {
            mismatch.push(`first_layer_timeout (got ${responseData.settings.first_layer_timeout}, expected ${firstLayerTimeoutVal})`)
          }
          if (responseData.settings.pause_on_runout !== pauseOnRunout()) {
            mismatch.push(`pause_on_runout (got ${responseData.settings.pause_on_runout}, expected ${pauseOnRunout()})`)
          }
          if (responseData.settings.start_print_timeout !== startPrintTimeoutVal) {
            mismatch.push(`start_print_timeout (got ${responseData.settings.start_print_timeout}, expected ${startPrintTimeoutVal})`)
          }
          if (responseData.settings.enabled !== enabled()) {
            mismatch.push(`enabled (got ${responseData.settings.enabled}, expected ${enabled()})`)
          }
          if (responseData.settings.elegooip !== elegooip()) {
            mismatch.push(`elegooip (got ${responseData.settings.elegooip}, expected ${elegooip()})`)
          }
          if (responseData.settings.ssid !== ssid()) {
            mismatch.push(`ssid (got ${responseData.settings.ssid}, expected ${ssid()})`)
          }

          if (mismatch.length > 0) {
            if (attempt < maxRetries) {
              lastError = `Validation failed: ${mismatch.join(', ')}. Retrying... (attempt ${attempt}/${maxRetries})`
              console.warn(lastError)
              await new Promise(resolve => setTimeout(resolve, 500 * attempt)) // Exponential backoff
              continue
            } else {
              throw new Error(`Settings validation failed after ${maxRetries} attempts: ${mismatch.join(', ')}`)
            }
          }

          // All validations passed
          saved = true
          break
        } catch (err: any) {
          lastError = err.message || 'Unknown error'
          if (attempt < maxRetries) {
            console.warn(`Save attempt ${attempt}/${maxRetries} failed: ${lastError}. Retrying...`)
            await new Promise(resolve => setTimeout(resolve, 500 * attempt))
          }
        }
      }

      if (!saved) {
        throw new Error(`Failed to save settings after ${maxRetries} attempts: ${lastError}`)
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      setError(`Error saving settings: ${err.message || 'Unknown error'}`)
      console.error('Failed to save settings:', err)
    }
  }

  return (
    <div class="card" >


      {loading() ? (
        <p>Loading settings.. <span class="loading loading-spinner loading-xl"></span>.</p>
      ) : (
        <div>
          {error() && (
            <div role="alert" class="mb-4 alert alert-error">
              {error()}
            </div>
          )}

          {saveSuccess() && (
            <div role="alert" class="mb-4 alert alert-success">
              Settings saved successfully!
            </div>
          )}

          <h2 class="text-lg font-bold mb-4">Wifi Settings</h2>
          {apMode() && (
            <div>
              <fieldset class="fieldset ">
                <legend class="fieldset-legend">SSID</legend>
                <input
                  type="text"
                  id="ssid"
                  value={ssid()}
                  onInput={(e) => setSsid(e.target.value)}
                  placeholder="Enter WiFi network name..."
                  class="input"
                />
              </fieldset>


              <fieldset class="fieldset">
                <legend class="fieldset-legend">Password</legend>
                <input
                  type="password"
                  id="password"
                  value={password()}
                  onInput={(e) => setPassword(e.target.value)}
                  placeholder="Enter WiFi password..."
                  class="input"
                />
              </fieldset>


              <div role="alert" class="mt-4 alert alert-info alert-soft">
                <span>Note: after changing the wifi network you may need to enter a new IP address to get to this device. If the wifi connection fails, the device will revert to AP mode and you can reconnect by connecting to the Wifi network named ElegooXBTTSFS20. If your network supports MDNS discovery you can also find this device at <a class="link link-accent" href="http://ccxsfs20.local">
                  ccxsfs20.local</a></span>
              </div>
            </div>
          )
          }
          {
            !apMode() && (
              <button class="btn" onClick={() => setApMode(true)}>Change Wifi network</button>
            )
          }

          <h2 class="text-lg font-bold mb-4 mt-10">Device Settings</h2>


          <fieldset class="fieldset">
            <legend class="fieldset-legend">Elegoo Centauri Carbon IP Address</legend>
            <input
              type="text"
              id="elegooip"
              value={elegooip()}
              onInput={(e) => setElegooip(e.target.value)}
              placeholder="xxx.xxx.xxx.xxx"
              class="input"
            />
          </fieldset>


          <fieldset class="fieldset">
            <legend class="fieldset-legend">Movment Sensor Timeout</legend>
            <input
              type="number"
              id="timeout"
              value={timeout()}
              onInput={(e) => setTimeoutValue(e.target.value)}
              min="100"
              max="30000"
              step="100"
              class={`input ${invalidFields().includes('timeout') ? 'input-error' : ''}`}
            />
            <p class="label">Value in milliseconds between reading from the movement sensor</p>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">First Layer Timeout</legend>
            <input
              type="number"
              id="firstLayerTimeout"
              value={firstLayerTimeout()}
              onInput={(e) => setFirstLayerTimeout(e.target.value)}
              min="100"
              max="60000"
              step="100"
              class={`input ${invalidFields().includes('firstLayerTimeout') ? 'input-error' : ''}`}
            />
            <p class="label">Timeout in milliseconds for first layer</p>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Start Print Timeout</legend>
            <input
              type="number"
              id="startPrintTimeout"
              value={startPrintTimeout()}
              onInput={(e) => setStartPrintTimeout(e.target.value)}
              min="1000"
              max="60000"
              step="1000"
              class={`input ${invalidFields().includes('startPrintTimeout') ? 'input-error' : ''}`}
            />
            <p class="label">Time in milliseconds to wait after print starts before allowing pause on filament runout</p>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Pause on Runout</legend>
            <label class="label cursor-pointer">
              <input
                type="checkbox"
                id="pauseOnRunout"
                checked={pauseOnRunout()}
                onChange={(e) => setPauseOnRunout(e.target.checked)}
                class="checkbox checkbox-accent"
              />
              <span class="label-text">Pause printing when filament runs out, rather than letting the Elegoo Centauri Carbon handle the runout</span>

            </label>
          </fieldset>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Enabled</legend>
            <label class="label cursor-pointer">
              <input
                type="checkbox"
                id="enabled"
                checked={enabled()}
                onChange={(e) => setEnabled(e.target.checked)}
                class="checkbox checkbox-accent"
              />
              <span class="label-text">When unchecked, it will completely disable pausing, useful for prints with ironing</span>

            </label>
          </fieldset>

          <button
            class="btn btn-accent btn-soft mt-10"
            onClick={handleSave}
          >
            Save Settings
          </button>
        </div >
      )
      }
    </div >
  )
}

export default Settings 