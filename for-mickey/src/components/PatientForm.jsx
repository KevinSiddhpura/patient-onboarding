import { useId, useState } from "react";
import { FIELD_LIMITS } from "../constants.js";
import { describeError } from "../errors.js";
import { validatePatient } from "../validation.js";

const EMPTY_VALUES = { name: "", phone: "", condition: "" };

const FIELDS = [
  { name: "name", label: "Name", type: "text", placeholder: "Patient name" },
  { name: "phone", label: "Phone", type: "tel", placeholder: "Phone number" },
  { name: "condition", label: "Condition", type: "text", placeholder: "Patient condition" },
];

// If onSubmit rejects, the typed input stays so the user can retry.
export default function PatientForm({
  initialValues = EMPTY_VALUES,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  clearOnSuccess = false,
}) {
  const formId = useId();
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const result = validatePatient(values);
    setFieldErrors(result.errors);
    setSubmitError("");
    if (!result.isValid) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(result.values);
      if (clearOnSuccess) {
        setValues(EMPTY_VALUES);
      }
    } catch (error) {
      console.error("Saving patient failed:", error);
      setSubmitError(
        describeError(error, "Could not save the patient. Your input is kept; try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form" noValidate>
      {FIELDS.map((field) => {
        const inputId = `${formId}-${field.name}`;
        const error = fieldErrors[field.name];

        return (
          <div className="form-group" key={field.name}>
            <label htmlFor={inputId}>{field.label}</label>
            <input
              id={inputId}
              name={field.name}
              type={field.type}
              placeholder={field.placeholder}
              maxLength={FIELD_LIMITS[field.name]}
              value={values[field.name]}
              onChange={handleChange}
              aria-invalid={Boolean(error)}
            />
            {error && <span className="field-error">{error}</span>}
          </div>
        );
      })}

      {submitError && <p className="message message-error" role="alert">{submitError}</p>}

      <div className="button-row">
        <button type="submit" disabled={submitting}>
          {submitting ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary-button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
