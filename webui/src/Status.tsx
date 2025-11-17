import { createSignal, onMount, onCleanup } from 'solid-js'



const PRINT_STATUS_MAP = {
  0: 'Idle',
  1: 'Homing',
  2: 'Dropping',
  3: 'Exposing',
  4: 'Lifting',
  5: 'Pausing',
  6: 'Paused',
  7: 'Stopping',
  8: 'Stopped',
  9: 'Complete',
  10: 'File Checking',
  13: 'Printing',
  15: 'Unknown: 15',
  16: 'Heating',
  18: 'Unknown: 18',
  19: 'Unknown: 19',
  20: 'Bed Leveling',
  21: 'Unknown: 21',
}

function Status() {

  const [loading, setLoading] = createSignal(false)
  const [lastMovementTime, setLastMovementTime] = createSignal<number>(Date.now())
  const [elapsedTime, setElapsedTime] = createSignal<number>(0)
  const [sensorStatus, setSensorStatus] = createSignal<any>({
    stopped: false,
    filamentRunout: false,
    elegoo: {
      mainboardID: '',
      printStatus: 0,
      isPrinting: false,
      currentLayer: 0,
      totalLayer: 0,
      progress: 0,
      currentTicks: 0,
      totalTicks: 0,
      PrintSpeedPct: 0,
      isWebsocketConnected: false,
      currentZ: 0,
      avgTimeBetweenTicks: 0,
      minTickTime: 0,
      maxTickTime: 0,
      tickSampleCount: 0,
      startAvgTickTime: 0,
      startMinTickTime: 0,
      startMaxTickTime: 0,
      startTickCount: 0,
      firstLayerAvgTickTime: 0,
      firstLayerMinTickTime: 0,
      firstLayerMaxTickTime: 0,
      firstLayerTickCount: 0,
      laterLayersAvgTickTime: 0,
      laterLayersMinTickTime: 0,
      laterLayersMaxTickTime: 0,
      laterLayersTickCount: 0,
    },
    settings: {
      timeout: 0,
      first_layer_timeout: 0,
      enabled: false,
    }
  })

  const refreshSensorStatus = async () => {
    try {
      const response = await fetch('/sensor_status')
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()

      // Track movement state for elapsed time timer - only when actively printing
      const isPrinting = data.elegoo?.isPrinting && data.elegoo?.printStatus === 13
      const wasMoving = !sensorStatus().stopped
      const isMoving = !data.stopped

      if (isPrinting) {
        if (wasMoving && !isMoving) {
          // Movement just stopped during active printing - start the timer
          setLastMovementTime(Date.now())
        } else if (!wasMoving && isMoving) {
          // Movement resumed during active printing - reset timer
          setLastMovementTime(Date.now())
          setElapsedTime(0)
        }
      } else {
        // Not actively printing - ensure timer is reset
        setElapsedTime(0)
      }

      setSensorStatus(data)
      setLoading(false)
    } catch (error) {
      console.error('Sensor status error:', error)
      setLoading(false)
    }
  }

  // Get the active timeout value
  // Only treat as "first layer" if the printer is actively printing and the
  // currentLayer or currentZ indicate the first layer. If not printing, fall
  // back to the regular movement timeout.
  const getActiveTimeout = () => {
    const status = sensorStatus()
    const timeout = status.settings?.timeout ?? 5000
    const firstLayerTimeout = status.settings?.first_layer_timeout ?? 8000

    const isPrinting = !!status.elegoo?.isPrinting
    const layer = typeof status.elegoo?.currentLayer === 'number' ? status.elegoo.currentLayer : undefined

    // Only treat as first layer when printer is printing and layer is 1 or below
    const isFirstLayer = isPrinting && (typeof layer === 'number' && layer <= 1)
    const activeTimeout = isFirstLayer ? firstLayerTimeout : timeout

    console.log('getActiveTimeout:', {
      isPrinting,
      layer,
      isFirstLayer,
      timeout,
      firstLayerTimeout,
      activeTimeout
    })

    return activeTimeout
  }

  // Calculate elapsed time since filament stopped
  const updateElapsedTime = () => {
    // Only update elapsed time if printer is actively printing
    const isPrinting = sensorStatus().elegoo?.isPrinting
    const printStatus = sensorStatus().elegoo?.printStatus
    
    // Print status 13 = printing, don't count time for completed (9) or paused (6) states
    if (sensorStatus().stopped && isPrinting && printStatus === 13) {
      setElapsedTime(Date.now() - lastMovementTime())
    } else {
      setElapsedTime(0)
    }
  }

  onMount(async () => {
    setLoading(true)
    refreshSensorStatus()

    // Refresh sensor status every 2.5 seconds
    const statusIntervalId = setInterval(refreshSensorStatus, 2500)

    // Update elapsed time every 100ms for smooth display
    const timerIntervalId = setInterval(updateElapsedTime, 100)

    onCleanup(() => {
      clearInterval(statusIntervalId)
      clearInterval(timerIntervalId)
    })
  })

  return (
    <div>
        <div>
          <div class="flex items-center gap-2 mb-2">
            <h2 class="text-xl font-semibold">Status</h2>
            {loading() && <span class="loading loading-spinner loading-sm"></span>}
          </div>
          <div class="stats w-full shadow bg-base-200">
            {sensorStatus().elegoo.isWebsocketConnected && <>
              <div class="stat">
                <div class="stat-title">Filament Stopped</div>
                <div class={`stat-value ${sensorStatus().stopped ? 'text-error' : 'text-success'}`}> {sensorStatus().stopped ? 'Yes' : 'No'}</div>
              </div>
              <div class="stat">
                <div class="stat-title">Filament Runout</div>
                <div class={`stat-value ${sensorStatus().filamentRunout ? 'text-error' : 'text-success'}`}> {sensorStatus().filamentRunout ? 'Yes' : 'No'}</div>
              </div>
            </>
            }
            <div class="stat">
              <div class="stat-title">Printer Connected</div>
              <div class={`stat-value ${sensorStatus().elegoo.isWebsocketConnected ? 'text-success' : 'text-error'}`}> {sensorStatus().elegoo.isWebsocketConnected ? 'Yes' : 'No'}</div>
            </div>
          </div>
          <div class="card w-full mt-8 bg-base-200 card-sm shadow-sm">
            <div class="card-body">
              <h2 class="card-title">More Information</h2>
              <div class="text-sm flex gap-4 flex-wrap">
                <div>
                  <h3 class="font-bold">Mainboard ID</h3>
                  <p>{sensorStatus().elegoo.mainboardID}</p>
                </div>
                <div>
                  <h3 class="font-bold">Currently Printing</h3>
                  <p>{sensorStatus().elegoo.isPrinting ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <h3 class="font-bold">Print Status</h3>
                  <p>{PRINT_STATUS_MAP[sensorStatus().elegoo.printStatus as keyof typeof PRINT_STATUS_MAP]}</p>
                </div>

                <div>
                  <h3 class="font-bold">Current Layer</h3>
                  <p>{sensorStatus().elegoo.currentLayer}</p>
                </div>
                <div>
                  <h3 class="font-bold">Total Layer</h3>
                  <p>{sensorStatus().elegoo.totalLayer}</p>
                </div>
                <div>
                  <h3 class="font-bold">Progress</h3>
                  <p>{sensorStatus().elegoo.progress}</p>
                </div>
                <div>
                  <h3 class="font-bold">Current Ticks</h3>
                  <p>{sensorStatus().elegoo.currentTicks}</p>
                </div>
                <div>
                  <h3 class="font-bold">Total Ticks</h3>
                  <p>{sensorStatus().elegoo.totalTicks}</p>
                </div>
                <div>
                  <h3 class="font-bold">Print Speed</h3>
                  <p>{sensorStatus().elegoo.PrintSpeedPct}</p>
                </div>
                <div>
                  <h3 class="font-bold">Avg Time Between Ticks</h3>
                  <p>{sensorStatus().elegoo.tickSampleCount > 0 
                    ? `${(sensorStatus().elegoo.avgTimeBetweenTicks / 1000).toFixed(2)}s`
                    : 'N/A (waiting for tick changes)'}</p>
                </div>
                <div>
                  <h3 class="font-bold">Pausing Enabled</h3>
                  <p>{sensorStatus().settings?.enabled ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <h3 class="font-bold">Movement Sensor Timeout</h3>
                  <p class="font-mono">{sensorStatus().settings?.timeout ?? 5000} ms</p>
                </div>
                <div>
                  <h3 class="font-bold">First Layer Timeout</h3>
                  <p class="font-mono">{sensorStatus().settings?.first_layer_timeout ?? 8000} ms</p>
                </div>
                <div>
                  <h3 class="font-bold">Active Timeout</h3>
                  <p class="font-mono font-bold text-lg">{getActiveTimeout()} ms</p>
                </div>
                <div>
                  <h3 class="font-bold">Elapsed Time</h3>
                  <p
                    class={`font-bold text-lg font-mono ${
                      sensorStatus().stopped && elapsedTime() > getActiveTimeout() * 0.75 
                        ? 'text-error' 
                        : sensorStatus().stopped 
                        ? 'text-warning'
                        : 'text-success'
                    }`}
                  >
                    {Math.round(elapsedTime())} / {getActiveTimeout()} ms
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="card w-full mt-8 bg-base-200 card-sm shadow-sm">
            <div class="card-body">
              <h2 class="card-title">Timer Diagnostics</h2>
              <p class="text-sm opacity-70 mb-4">These statistics help you set optimal timeout values. The device records time between printer ticks during different print phases.</p>
              <div class="text-sm flex gap-8 flex-wrap items-start">
                
                {/* Overall Statistics */}
                <div class="flex flex-col gap-2">
                  <span class="font-semibold">Overall</span>
                  <div class="flex gap-6">
                    <div>
                      <h3 class="font-bold">Average</h3>
                      <p class="font-mono text-lg">
                        {sensorStatus().elegoo.avgTimeBetweenTicks > 0 
                          ? `${(sensorStatus().elegoo.avgTimeBetweenTicks / 1000).toFixed(2)}s`
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <h3 class="font-bold">Samples</h3>
                      <p class="font-mono text-lg">{sensorStatus().elegoo.tickSampleCount}</p>
                    </div>
                    <div>
                      <h3 class="font-bold">Min / Max</h3>
                      <p class="font-mono text-lg">
                        {sensorStatus().elegoo.tickSampleCount > 0
                          ? `${(sensorStatus().elegoo.minTickTime / 1000).toFixed(2)}s / ${(sensorStatus().elegoo.maxTickTime / 1000).toFixed(2)}s`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Start Phase Statistics */}
                <div class="flex flex-col gap-2">
                  <span class="font-semibold">Start Phase</span>
                  {(!sensorStatus().elegoo.startTickCount || sensorStatus().elegoo.startTickCount === 0) ? (
                    <p class="opacity-70 text-xs">No data yet</p>
                  ) : (
                    <div class="flex gap-6">
                      <div>
                        <h3 class="font-bold">Average</h3>
                        <p class="font-mono text-lg">
                          {(sensorStatus().elegoo.startAvgTickTime / 1000).toFixed(2)}s
                        </p>
                      </div>
                      <div>
                        <h3 class="font-bold">Samples</h3>
                        <p class="font-mono text-lg">{sensorStatus().elegoo.startTickCount}</p>
                      </div>
                      <div>
                        <h3 class="font-bold">Min / Max</h3>
                        <p class="font-mono text-lg">
                          {(sensorStatus().elegoo.startMinTickTime / 1000).toFixed(2)}s / {(sensorStatus().elegoo.startMaxTickTime / 1000).toFixed(2)}s
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* First Layer Statistics */}
                <div class="flex flex-col gap-2">
                  <span class="font-semibold">First Layer</span>
                  {(!sensorStatus().elegoo.firstLayerTickCount || sensorStatus().elegoo.firstLayerTickCount === 0) ? (
                    <p class="opacity-70 text-xs">No data yet</p>
                  ) : (
                    <div class="flex gap-6">
                      <div>
                        <h3 class="font-bold">Average</h3>
                        <p class="font-mono text-lg">
                          {(sensorStatus().elegoo.firstLayerAvgTickTime / 1000).toFixed(2)}s
                        </p>
                      </div>
                      <div>
                        <h3 class="font-bold">Samples</h3>
                        <p class="font-mono text-lg">{sensorStatus().elegoo.firstLayerTickCount}</p>
                      </div>
                      <div>
                        <h3 class="font-bold">Min / Max</h3>
                        <p class="font-mono text-lg">
                          {(sensorStatus().elegoo.firstLayerMinTickTime / 1000).toFixed(2)}s / {(sensorStatus().elegoo.firstLayerMaxTickTime / 1000).toFixed(2)}s
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Later Layers Statistics */}
                <div class="flex flex-col gap-2">
                  <span class="font-semibold">Later Layers</span>
                  {(!sensorStatus().elegoo.laterLayersTickCount || sensorStatus().elegoo.laterLayersTickCount === 0) ? (
                    <p class="opacity-70 text-xs">No data yet</p>
                  ) : (
                    <div class="flex gap-6">
                      <div>
                        <h3 class="font-bold">Average</h3>
                        <p class="font-mono text-lg">
                          {(sensorStatus().elegoo.laterLayersAvgTickTime / 1000).toFixed(2)}s
                        </p>
                      </div>
                      <div>
                        <h3 class="font-bold">Samples</h3>
                        <p class="font-mono text-lg">{sensorStatus().elegoo.laterLayersTickCount}</p>
                      </div>
                      <div>
                        <h3 class="font-bold">Min / Max</h3>
                        <p class="font-mono text-lg">
                          {(sensorStatus().elegoo.laterLayersMinTickTime / 1000).toFixed(2)}s / {(sensorStatus().elegoo.laterLayersMaxTickTime / 1000).toFixed(2)}s
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div class="mt-4 flex justify-end">
                  <button 
                    class="btn btn-sm btn-accent"
                    onClick={async () => {
                      try {
                        await fetch('/reset_stats', { method: 'POST' })
                        // Refresh to show cleared stats
                        await refreshSensorStatus()
                      } catch (e) {
                        console.error('Device stats reset failed:', e)
                      }
                    }}
                  >
                    Reset Statistics
                  </button>
              </div>
            </div>
          </div>

        </div>
    </div>
  )
}

export default Status 