"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { ChoiceGroup } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { selectClass } from "./step-ui";

const OTHER = "__other__";

export type Choice = string | { value: string; label: string };

function choiceValue(choice: Choice) {
  return typeof choice === "string" ? choice : choice.value;
}

function choiceLabel(choice: Choice) {
  return typeof choice === "string" ? choice : choice.label;
}

/** Dropdown with an "Other" entry that reveals a text box; the submitted value is always plain text. */
export function ChoiceField({
  id,
  name,
  defaultValue = "",
  options = [],
  groups,
  placeholder = "Select",
  otherLabel = "Other (type your own)",
  otherPlaceholder = "Type here",
  allowOther = true,
  required,
  onValueChange,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  options?: Choice[];
  groups?: ChoiceGroup[];
  placeholder?: string;
  otherLabel?: string;
  otherPlaceholder?: string;
  allowOther?: boolean;
  required?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const known = new Set([
    ...options.map(choiceValue),
    ...(groups ?? []).flatMap((group) => group.options),
  ]);
  const startsAsOther = Boolean(defaultValue) && !known.has(defaultValue);
  const [selected, setSelected] = useState(startsAsOther ? OTHER : defaultValue);
  const [custom, setCustom] = useState(startsAsOther ? defaultValue : "");
  const [picked, setPicked] = useState(false);
  const isOther = selected === OTHER;
  const value = isOther ? custom : selected;

  function pick(next: string) {
    setSelected(next);
    setPicked(true);
    onValueChange?.(next === OTHER ? custom : next);
  }

  return (
    <div className="grid gap-2">
      <select
        id={id}
        value={selected}
        onChange={(event) => pick(event.target.value)}
        required={required && !isOther}
        className={cn(selectClass, !selected && "text-muted-foreground")}
      >
        <option value="" disabled={required}>
          {placeholder}
        </option>
        {options.map((choice) => (
          <option key={choiceValue(choice)} value={choiceValue(choice)}>
            {choiceLabel(choice)}
          </option>
        ))}
        {(groups ?? []).map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </optgroup>
        ))}
        {allowOther ? <option value={OTHER}>{otherLabel}</option> : null}
      </select>
      {isOther ? (
        <Input
          aria-label={`${id} (other)`}
          value={custom}
          onChange={(event) => {
            setCustom(event.target.value);
            onValueChange?.(event.target.value);
          }}
          placeholder={otherPlaceholder}
          required={required}
          autoFocus={picked}
          className="animate-in fade-in slide-in-from-top-1 duration-200"
        />
      ) : null}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
