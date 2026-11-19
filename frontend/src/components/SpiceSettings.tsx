import { CUSTOMER_SPICE_LEVELS, SpiceOptions } from "@/lib/menu-customizations";

export default function SpiceSettings({ enabled, onEnable, options, onChange }: {
  enabled: boolean;
  onEnable: (enabled: boolean) => void;
  options: SpiceOptions;
  onChange: (options: SpiceOptions) => void;
}) {
  return (
    <fieldset className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
      <legend className="px-1 text-xs font-bold text-slate-800">Spice customization</legend>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={enabled} onChange={(event) => onEnable(event.target.checked)} />
        Let customers choose spice level
      </label>
      {enabled && <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">Select the levels you can prepare. Keep at least one selected.</p>
        <div className="flex flex-wrap gap-2">
          {CUSTOMER_SPICE_LEVELS.map((level) => <label key={level} className="flex items-center gap-2 rounded-lg border border-orange-200 px-3 py-2 text-xs">
            <input type="checkbox" checked={options.levels.includes(level)} disabled={options.levels.length === 1 && options.levels.includes(level)} onChange={(event) => {
              const levels = CUSTOMER_SPICE_LEVELS.filter((entry) => entry === level ? event.target.checked : options.levels.includes(entry));
              onChange({ levels, defaultLevel: levels.includes(options.defaultLevel) ? options.defaultLevel : levels[0] });
            }} />
            {level}
          </label>)}
        </div>
        <label className="block text-xs font-semibold">Default spice level
          <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={options.defaultLevel} onChange={(event) => onChange({ ...options, defaultLevel: event.target.value })}>
            {options.levels.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>}
    </fieldset>
  );
}
