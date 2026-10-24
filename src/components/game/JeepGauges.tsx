'use client';

/**
 * JeepGauges — the dash cluster shown while the player sits in the jeep.
 *
 * Three dials built from the gauge-ui primitives (https://gauge-ui.dev,
 * installed as a shadcn registry into @/components/gauge), dressed in the
 * RATFIRE HUD livery (zinc glass + amber ink):
 *
 *   • FUEL  — small top-half dial, E → F, red band under 15 %, % readout
 *   • SPEED — big speedometer 0–240 km/h, ticks every 20, labels every 40,
 *             redline band from 200, amber fill arc + pointer needle
 *   • TEMP  — small top-half dial, 50–130 °C, zinc/amber/red heat zones
 *
 * Warning behaviors ride the same 12 Hz flush: the FUEL dial grows a
 * pulsing red halo and blinks its % readout under 15 %, the TEMP dial
 * trembles inside a pulsing red halo past the 112 ° red zone, and the dash
 * radio ({@link JeepGaugesHandle.setRadio}) animates a tiny three-bar
 * equalizer chip floating above the cluster.
 *
 * The game loop pushes telemetry every frame through the imperative
 * {@link JeepGaugesHandle.update} handle; the component throttles those
 * pushes into a ~12 Hz React flush and lets the needles spring toward each
 * flushed target, so the giant page component never re-renders per frame.
 * Visibility is flipped straight from the loop via
 * {@link JeepGaugesHandle.setVisible} — the same direct-DOM pattern as the
 * drive/flight HUD chips.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Gauge,
  GaugeArc,
  GaugeHub,
  GaugeNeedle,
  GaugeText,
  GaugeTickLabels,
  GaugeTicks,
  GaugeTrack,
  GaugeValue,
  GaugeZones,
} from '@/components/gauge';

export interface JeepGaugesHandle {
  /** Show (player seated at the wheel) or hide the cluster. */
  setVisible(visible: boolean): void;
  /** Push live dash telemetry — safe to call every frame. */
  update(speedKmh: number, fuelPct: number, tempC: number): void;
  /** Dash radio on/off — toggles the animated equalizer chip. */
  setRadio(on: boolean): void;
}

/** Gauge domains. */
const SPEED_MAX = 240; // km/h dial ceiling (the jeep tops out near 200)
const SPEED_REDLINE = 200; // km/h where the outer red band starts
const TEMP_MIN = 50; // °C cold-soaked engine
const TEMP_MAX = 130; // °C dial ceiling
const TEMP_WARM = 95; // °C where the amber band starts
const TEMP_HOT = 112; // °C where the red band starts
const FUEL_LOW = 15; // % where the low-fuel band sits

/** Needle sweep: a quick, slightly bouncy automotive spring. */
const NEEDLE_SPRING = {
  type: 'spring',
  visualDuration: 0.4,
  bounce: 0.15,
} as const;

/** Cluster animations: hot-engine jitter, warning halos, low-fuel blink
 *  and the radio equalizer bars. Injected once with the component. */
const JEEP_GAUGE_CSS = `
@keyframes jf-jitter {
  0%, 100% { transform: translate(0px, 0px); }
  25% { transform: translate(0.8px, -0.5px); }
  50% { transform: translate(-0.7px, 0.6px); }
  75% { transform: translate(0.5px, 0.7px); }
}
@keyframes jf-pulse {
  0%, 100% { opacity: 0.12; }
  50% { opacity: 0.9; }
}
@keyframes jf-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
@keyframes jf-eq {
  0%, 100% { transform: scaleY(0.35); }
  50% { transform: scaleY(1); }
}
.jf-tremble { animation: jf-jitter 130ms linear infinite; }
.jf-halo { animation: jf-pulse 0.7s ease-in-out infinite; }
.jf-blink { animation: jf-blink 0.9s ease-in-out infinite; }
.jf-eq-bar { animation: jf-eq 0.52s ease-in-out infinite; }
`;

type Reading = { speed: number; fuel: number; temp: number };

const JeepGauges = forwardRef<JeepGaugesHandle, { className?: string }>(
  function JeepGauges({ className }, ref) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    /** Latest telemetry from the game loop (mutated in place, zero alloc). */
    const pendingRef = useRef({ speed: 0, fuel: 100, temp: 58, dirty: false });
    /** Flushed snapshot the SVG dials actually render from. */
    const [reading, setReading] = useState<Reading>({
      speed: 0,
      fuel: 100,
      temp: 58,
    });
    /** Dash radio toggle — flipped imperatively via the handle. */
    const [radioOn, setRadioOn] = useState(false);

    useImperativeHandle(
      ref,
      () => ({
        setVisible(visible) {
          if (rootRef.current) {
            rootRef.current.style.display = visible ? 'flex' : 'none';
          }
        },
        update(speedKmh, fuelPct, tempC) {
          const p = pendingRef.current;
          p.speed = speedKmh;
          p.fuel = fuelPct;
          p.temp = tempC;
          p.dirty = true;
        },
        setRadio(on) {
          setRadioOn(on);
        },
      }),
      []
    );

    // Throttle the per-frame pushes into a ~12 Hz React flush; the needles
    // spring toward each flushed target so the sweep stays smooth between.
    useEffect(() => {
      const id = window.setInterval(() => {
        const p = pendingRef.current;
        if (!p.dirty) return;
        p.dirty = false;
        setReading({ speed: p.speed, fuel: p.fuel, temp: p.temp });
      }, 80);
      return () => window.clearInterval(id);
    }, []);

    const fuelLow = reading.fuel <= FUEL_LOW;
    const tempHot = reading.temp >= TEMP_HOT;

    return (
      <div
        ref={rootRef}
        style={{ display: 'none' }}
        aria-live="polite"
        className={
          'pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 sm:bottom-8 ' +
          (className ?? '')
        }
      >
        {/* dial warning + equalizer animations (tiny, scoped class names) */}
        <style>{JEEP_GAUGE_CSS}</style>
        {/* dash radio: a three-bar equalizer chip floating above the dial
            pack, animating only while the R-toggled radio is on */}
        {radioOn && (
          <div
            aria-hidden
            className="absolute -top-7 left-1/2 flex -translate-x-1/2 items-end gap-[3px]"
          >
            <span
              className="jf-eq-bar inline-block h-3 w-[3px] origin-bottom rounded-full bg-amber-300/90"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="jf-eq-bar inline-block h-3 w-[3px] origin-bottom rounded-full bg-amber-300/90"
              style={{ animationDelay: '160ms' }}
            />
            <span
              className="jf-eq-bar inline-block h-3 w-[3px] origin-bottom rounded-full bg-amber-300/90"
              style={{ animationDelay: '320ms' }}
            />
          </div>
        )}
        {/* no card behind the cluster — each dial carries its own black
            circular face, sized to its own viewBox, floating on the view */}
        <div className="flex items-end gap-2 drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)] sm:gap-4">
            {/* ==== FUEL — small dial, E (empty, left) → F (full, right) ==== */}
              <Gauge
                value={reading.fuel}
                min={0}
                max={100}
                startAngle={90}
                endAngle={270}
                radius={100}
                padding={42}
                transition={NEEDLE_SPRING}
                className="h-24 w-24 sm:h-28 sm:w-28"
              >
                {/* black dial face, sized to this gauge's viewBox */}
                <circle r={142} fill="#09090b" opacity={0.88} />
                {/* low-fuel warning: pulsing red halo hugging the face rim */}
                {fuelLow && (
                  <circle
                    r={142}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={7}
                    className="jf-halo"
                  />
                )}
                <GaugeTrack width={10} color="#f4f4f5" opacity={0.12} />
                <GaugeZones
                  zones={[{ to: FUEL_LOW, color: '#ef4444' }]}
                  width={6}
                  offset={22}
                  cap="round"
                />
                <GaugeArc
                  width={10}
                  color={fuelLow ? '#ef4444' : '#34d399'}
                />
                <GaugeTicks
                  count={2}
                  length={8}
                  width={2}
                  color="#a1a1aa"
                  opacity={0.6}
                  offset={-20}
                />
                <GaugeTickLabels
                  count={1}
                  offset={34}
                  fontSize={17}
                  color="#d4d4d8"
                  weight="bold"
                  format={(v) => (v < 50 ? 'E' : 'F')}
                />
                <GaugeNeedle
                  style="pointer"
                  length={0.68}
                  width={6}
                  color="#fcd34d"
                  tail={14}
                  tailColor="#f59e0b"
                />
                <GaugeHub radius={7} color="#fcd34d" />
                <GaugeValue
                  y={38}
                  fontSize={24}
                  color={fuelLow ? '#f87171' : '#fde68a'}
                  font="mono"
                  className={fuelLow ? 'jf-blink' : undefined}
                  format={(v) => `${Math.round(v)}%`}
                />
                {/* gauge name, tucked into the inner bottom of the face */}
                <GaugeText
                  y={104}
                  fontSize={19}
                  color="#a1a1aa"
                  weight="bold"
                  className="tracking-[0.22em]"
                >
                  FUEL
                </GaugeText>
              </Gauge>

            {/* ==== SPEED — big speedometer with a 200+ redline band ==== */}
              <Gauge
                value={reading.speed}
                min={0}
                max={SPEED_MAX}
                startAngle={40}
                endAngle={320}
                radius={100}
                padding={46}
                transition={NEEDLE_SPRING}
                className="h-36 w-36 sm:h-44 sm:w-44"
              >
                {/* black dial face, sized to this gauge's viewBox */}
                <circle r={146} fill="#09090b" opacity={0.88} />
                <GaugeTrack width={12} color="#f4f4f5" opacity={0.12} />
                <GaugeZones
                  zones={[
                    { to: SPEED_REDLINE, color: '#3f3f46' },
                    { to: SPEED_MAX, color: '#ef4444' },
                  ]}
                  width={6}
                  offset={24}
                  cap="round"
                />
                <GaugeArc width={12} color="#fbbf24" />
                <GaugeTicks
                  count={12}
                  length={9}
                  width={2}
                  color="#a1a1aa"
                  opacity={0.65}
                  offset={-24}
                />
                <GaugeTickLabels
                  count={6}
                  offset={-46}
                  fontSize={14}
                  color="#d4d4d8"
                />
                <GaugeNeedle
                  style="pointer"
                  length={0.74}
                  width={7}
                  color="#fcd34d"
                  tail={16}
                  tailColor="#f59e0b"
                />
                <GaugeHub radius={9} color="#fcd34d" />
                <GaugeValue
                  y={-24}
                  fontSize={36}
                  color="#fde68a"
                  font="mono"
                  format={(v) => String(Math.round(v))}
                />
                <GaugeText
                  y={30}
                  fontSize={12}
                  color="#a1a1aa"
                  font="mono"
                  className="tracking-[0.3em]"
                >
                  km/h
                </GaugeText>
                {/* gauge name, tucked into the inner bottom of the face */}
                <GaugeText
                  y={104}
                  fontSize={20}
                  color="#a1a1aa"
                  weight="bold"
                  className="tracking-[0.22em]"
                >
                  SPEED
                </GaugeText>
              </Gauge>

            {/* ==== TEMP — small dial, 50–130 °C with heat zones ==== */}
              <Gauge
                value={reading.temp}
                min={TEMP_MIN}
                max={TEMP_MAX}
                startAngle={90}
                endAngle={270}
                radius={100}
                padding={42}
                transition={NEEDLE_SPRING}
                className={
                  'h-24 w-24 sm:h-28 sm:w-28' + (tempHot ? ' jf-tremble' : '')
                }
              >
                {/* black dial face, sized to this gauge's viewBox */}
                <circle r={142} fill="#09090b" opacity={0.88} />
                {/* overheat warning: pulsing red halo hugging the face rim */}
                {tempHot && (
                  <circle
                    r={142}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={7}
                    className="jf-halo"
                  />
                )}
                <GaugeTrack width={10} color="#f4f4f5" opacity={0.12} />
                <GaugeZones
                  zones={[
                    { to: TEMP_WARM, color: '#52525b' },
                    { to: TEMP_HOT, color: '#fbbf24' },
                    { to: TEMP_MAX, color: '#ef4444' },
                  ]}
                  width={6}
                  offset={22}
                  cap="round"
                />
                <GaugeArc width={10} color="#fbbf24" />
                <GaugeTicks
                  count={2}
                  length={8}
                  width={2}
                  color="#a1a1aa"
                  opacity={0.6}
                  offset={-20}
                />
                <GaugeTickLabels
                  count={2}
                  offset={34}
                  fontSize={11}
                  color="#a1a1aa"
                />
                <GaugeNeedle
                  style="pointer"
                  length={0.68}
                  width={6}
                  color="#fcd34d"
                  tail={14}
                  tailColor="#f59e0b"
                />
                <GaugeHub radius={7} color="#fcd34d" />
                <GaugeValue
                  y={38}
                  fontSize={24}
                  color={tempHot ? '#f87171' : '#fde68a'}
                  font="mono"
                  format={(v) => `${Math.round(v)}°`}
                />
                {/* gauge name, tucked into the inner bottom of the face */}
                <GaugeText
                  y={104}
                  fontSize={19}
                  color="#a1a1aa"
                  weight="bold"
                  className="tracking-[0.22em]"
                >
                  TEMP
                </GaugeText>
              </Gauge>
        </div>
      </div>
    );
  }
);

export default JeepGauges;
