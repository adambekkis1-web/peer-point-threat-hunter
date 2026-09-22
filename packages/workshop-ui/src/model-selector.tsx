import { modelIdSchema, type ModelDefinition, type ModelId } from "@peer-point/workshop-config";

interface ModelSelectorProps {
  models: readonly ModelDefinition[];
  value: ModelId;
  disabled?: boolean;
  onChange: (modelId: ModelId) => void;
}

export function ModelSelector({ models, value, disabled = false, onChange }: ModelSelectorProps) {
  return (
    <label className="pp-model-selector">
      <span>Model</span>
      <select
        aria-label="Model"
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const result = modelIdSchema.safeParse(event.currentTarget.value);
          if (result.success) onChange(result.data);
        }}
      >
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label} · {model.provider}
          </option>
        ))}
      </select>
    </label>
  );
}
