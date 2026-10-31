"use client";

import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string };

export default function PasswordInput({ label, className = "", ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <input {...props} type={visible ? "text" : "password"} className={className + " pr-16"} />
    <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
      aria-pressed={visible} aria-controls={props.id}
      onClick={() => setVisible(value => !value)}
      className="absolute inset-y-0 right-0 min-w-14 rounded-r-xl px-3 text-xs font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-600">
      {visible ? "Hide" : "Show"}
    </button>
  </div>;
}
