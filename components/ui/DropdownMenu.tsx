"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Menú desplegable compartido — lo usan la barra del plan ("Compartir", "⋯") y
// la del día ("⋯") en ProgramacionModule. La lógica de cierre (clic fuera /
// Escape) y la navegación con flechas vive solo aquí para no duplicarla en
// cada barra.
export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  /** Renderiza la opción en rojo (acciones destructivas). */
  danger?: boolean;
  disabled?: boolean;
  /** Dibuja una línea separadora justo encima de esta opción. */
  separatorBefore?: boolean;
}

interface Props {
  /** Contenido del botón que abre el menú. */
  trigger: ReactNode;
  items: DropdownMenuItem[];
  /** Nombre accesible del botón (obligatorio cuando el trigger es solo un ícono). */
  ariaLabel?: string;
  buttonClassName?: string;
  buttonStyle?: CSSProperties;
  disabled?: boolean;
  /** Borde del menú alineado al del botón. Por defecto a la derecha. */
  align?: "left" | "right";
  /** Ancho mínimo del panel en px. */
  minWidth?: number;
}

export default function DropdownMenu({
  trigger,
  items,
  ariaLabel,
  buttonClassName = "",
  buttonStyle,
  disabled = false,
  align = "right",
  minWidth = 210,
}: Props) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  // -1 = ninguna opción enfocada todavía (se abrió con clic, no con teclado).
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabledIndexes = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const close = useCallback((devolverFoco: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (devolverFoco) buttonRef.current?.focus();
  }, []);

  // Clic fuera y Escape — un solo par de listeners, solo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); close(true); }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // Mueve el foco real del DOM a la opción activa (aria-activedescendant no
  // basta: el lector de pantalla y el usuario de teclado esperan foco).
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function abrirEn(pos: "primera" | "ultima" | "ninguna") {
    setOpen(true);
    if (pos === "ninguna" || enabledIndexes.length === 0) { setActiveIndex(-1); return; }
    setActiveIndex(pos === "primera" ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1]);
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) mover(1); else abrirEn("primera");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      abrirEn("ultima");
    }
  }

  function mover(delta: number) {
    if (enabledIndexes.length === 0) return;
    const actual = enabledIndexes.indexOf(activeIndex);
    const siguiente = actual < 0
      ? (delta > 0 ? 0 : enabledIndexes.length - 1)
      : (actual + delta + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[siguiente]);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); mover(1); break;
      case "ArrowUp":   e.preventDefault(); mover(-1); break;
      case "Home":      e.preventDefault(); if (enabledIndexes.length) setActiveIndex(enabledIndexes[0]); break;
      case "End":       e.preventDefault(); if (enabledIndexes.length) setActiveIndex(enabledIndexes[enabledIndexes.length - 1]); break;
      case "Tab":       close(false); break;
      default: break;
    }
  }

  function seleccionar(item: DropdownMenuItem) {
    if (item.disabled) return;
    close(false);
    item.onSelect();
  }

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : abrirEn("ninguna"))}
        onKeyDown={onTriggerKeyDown}
        className={buttonClassName}
        style={buttonStyle}
      >
        {trigger}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={onMenuKeyDown}
          className={`absolute top-full mt-1.5 z-40 rounded-xl border border-gray-200 bg-white shadow-lg py-1 ${align === "right" ? "right-0" : "left-0"}`}
          style={{ minWidth }}
        >
          {items.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              {item.separatorBefore && <div className="my-1 h-px bg-gray-100" />}
              <button
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={i === activeIndex ? 0 : -1}
                onClick={() => seleccionar(item)}
                onMouseEnter={() => !item.disabled && setActiveIndex(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none ${
                  item.danger
                    ? "text-red-600 hover:bg-red-50 focus:bg-red-50"
                    : "text-gray-700 hover:bg-gray-50 focus:bg-gray-50"
                }`}
              >
                {item.icon && <span className="shrink-0 flex items-center">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
