"use client";

import * as React from "react";
import { PlatformSelect } from "./PlatformSelect";
import { optionsFromChildren } from "../lib/select-options";

type Props = {
  id?: string;
  name?: string;
  defaultValue?: string | number;
  value?: string | number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  /**
   * Native-select-shaped change handler so existing call sites keep reading event.target.value.
   * Only target.value is populated.
   */
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
};

/**
 * Drop-in for a native <select> with <option> children: same props, but it opens the platform's
 * popover list, so phones get readable type and real touch targets instead of the OS wheel.
 * A disabled empty-value option becomes the placeholder.
 */
export function OptionSelect({ children, onChange, className, value, defaultValue, ...props }: Props) {
  const { options, placeholder } = optionsFromChildren(children);
  return (
    <PlatformSelect
      {...props}
      value={value === undefined ? undefined : String(value)}
      defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
      className={className}
      options={options}
      placeholder={placeholder}
      onValueChange={onChange ? (value) => onChange({ target: { value } } as React.ChangeEvent<HTMLSelectElement>) : undefined}
    />
  );
}
