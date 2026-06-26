/**
 * <ob-admin-calendar> - Inferred aggregate calendar for temporal admin entities.
 */
import { ObApi, type AdminTemporalEntity } from "./ob-api";
import { displayName, escapeAttr, escapeHtml, fieldFormat, formatValue, labelFor } from "../format";
import { stylesheetLink } from "../style-link";

type CalendarView = "month" | "list";

type TemporalDescriptor = {
  startField: string;
  startKind: TemporalKind;
  timeField: string;
  endField: string;
};

type TemporalKind = "date" | "time" | "date-time";

type CalendarEvent = {
  id: string;
  entity: string;
  entityLabel: string;
  title: string;
  href: string;
  start: Date;
  end: Date | null;
  dateKey: string;
  timeLabel: string;
  color: number;
};

export class ObAdminCalendar extends HTMLElement {
  private _view: CalendarView = "month";
  private _entityFilter = "";
  private _monthKey = "";
  private _error = "";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  async connectedCallback() {
    await this._render();
  }

  private async _render() {
    const api = ObApi.instance;
    if (!api) return;
    await api.ready();

    const entities = api.getAdminTemporalEntities().filter((entity) => api.canCollection(entity.entity, "read"));
    if (entities.length === 0) {
      this.shadowRoot!.innerHTML = `${stylesheetLink()}<p class="empty">No calendar records are available.</p>`;
      return;
    }

    const events = await this._loadEvents(api, entities);
    if (this._entityFilter && !entities.some((entity) => entity.entity === this._entityFilter)) this._entityFilter = "";
    const visibleEvents = events.filter((event) => !this._entityFilter || event.entity === this._entityFilter);
    if (!this._monthKey) this._monthKey = chooseInitialMonth(visibleEvents);

    this.shadowRoot!.innerHTML = `
      ${stylesheetLink()}
      <section class="calendar-shell">
        <div class="calendar-header">
          <div>
            <div class="eyebrow">${visibleEvents.length} event${visibleEvents.length === 1 ? "" : "s"}</div>
            <h1>Calendar</h1>
          </div>
          <div class="calendar-summary">
            <span>${entities.length} temporal ${entities.length === 1 ? "entity" : "entities"}</span>
          </div>
        </div>
        <div class="calendar-toolbar">
          <div class="segmented" role="group" aria-label="Calendar view">
            ${(["month", "list"] as CalendarView[]).map((view) => `
              <button type="button" data-view="${view}" class="${this._view === view ? "active" : ""}">${view === "month" ? "Month" : "List"}</button>
            `).join("")}
          </div>
          <label class="calendar-filter">
            <span>Entity</span>
            <select data-action="entity-filter">
              <option value="">All</option>
              ${entities.map((entity) => `<option value="${escapeAttr(entity.entity)}" ${this._entityFilter === entity.entity ? "selected" : ""}>${escapeHtml(entity.label)}</option>`).join("")}
            </select>
          </label>
          ${this._view === "month" ? this._renderMonthControls() : ""}
        </div>
        ${this._error ? `<div class="error-msg" role="alert">${escapeHtml(this._error)}</div>` : ""}
        ${this._view === "month" ? this._renderMonth(visibleEvents) : this._renderList(visibleEvents)}
      </section>
    `;

    this._bindActions();
  }

  private async _loadEvents(api: ObApi, entities: AdminTemporalEntity[]): Promise<CalendarEvent[]> {
    this._error = "";
    const groups = await Promise.all(entities.map(async (entity, index) => {
      const schema = api.getSchema(entity.entity);
      const descriptor = temporalDescriptor(schema, entity.temporalFields);
      if (!schema || !descriptor) return [];
      const params = new URLSearchParams({ limit: "1000", sort: descriptor.startField, order: "asc" });
      try {
        const res = await api.request(`/api/${entity.entity}s?${params}`);
        if (!res.ok) throw new Error(`${entity.label}: ${res.status}`);
        const data = await res.json();
        const rows = data.items || [];
        const lookups = await loadCalendarLookups(api, entity.entity, rows);
        return rows
          .map((row: Record<string, unknown>) => eventFromRow(api, entity, schema, descriptor, row, index, lookups))
          .filter((event: CalendarEvent | null): event is CalendarEvent => event !== null);
      } catch (error: any) {
        this._error = error?.message || "Could not load calendar records.";
        return [];
      }
    }));

    return groups.flat().sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title));
  }

  private _renderMonthControls(): string {
    const label = monthLabel(parseMonthKey(this._monthKey));
    return `
      <div class="month-controls" aria-label="Calendar month">
        <button type="button" data-month="previous" aria-label="Previous month">Previous</button>
        <strong>${escapeHtml(label)}</strong>
        <button type="button" data-month="next" aria-label="Next month">Next</button>
      </div>
    `;
  }

  private _renderMonth(events: CalendarEvent[]): string {
    const month = parseMonthKey(this._monthKey);
    const days = monthDays(month);
    const byDay = groupEventsByDay(events);
    return `
      <div class="calendar-grid" aria-label="${escapeAttr(monthLabel(month))}">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<div class="weekday">${day}</div>`).join("")}
        ${days.map((day) => {
          const key = dateKey(day);
          const dayEvents = byDay.get(key) || [];
          const visible = dayEvents.slice(0, 3);
          const extra = dayEvents.length - visible.length;
          return `
            <section class="calendar-day ${day.getMonth() === month.getMonth() ? "" : "outside"} ${key === dateKey(new Date()) ? "today" : ""}" aria-label="${escapeAttr(fullDateLabel(day))}">
              <div class="day-number"><time datetime="${key}">${day.getDate()}</time></div>
              <div class="day-events">
                ${visible.map((event) => calendarEventLink(event)).join("")}
                ${extra > 0 ? `<span class="more-events">+${extra} more</span>` : ""}
              </div>
            </section>
          `;
        }).join("")}
      </div>
    `;
  }

  private _renderList(events: CalendarEvent[]): string {
    return `
      <div class="calendar-list">
        ${events.map((event) => `
          <a class="event-row event-color-${event.color}" href="${escapeAttr(event.href)}">
            <time datetime="${escapeAttr(event.dateKey)}">${escapeHtml(shortDateLabel(event.start))}</time>
            <span>${escapeHtml(event.timeLabel)}</span>
            <strong>${escapeHtml(event.title)}</strong>
            <em>${escapeHtml(event.entityLabel)}</em>
          </a>
        `).join("") || `<div class="empty-state">No events match this filter.</div>`}
      </div>
    `;
  }

  private _bindActions() {
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", async () => {
        this._view = button.dataset.view === "list" ? "list" : "month";
        await this._render();
      });
    });
    this.shadowRoot!.querySelector<HTMLSelectElement>('[data-action="entity-filter"]')?.addEventListener("change", async (event) => {
      this._entityFilter = (event.target as HTMLSelectElement).value;
      this._monthKey = "";
      await this._render();
    });
    this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-month]").forEach((button) => {
      button.addEventListener("click", async () => {
        this._monthKey = shiftMonth(this._monthKey, button.dataset.month === "previous" ? -1 : 1);
        await this._render();
      });
    });
  }
}

function temporalDescriptor(schema: any | null, fields: string[]): TemporalDescriptor | null {
  const candidates = fields
    .map((field) => ({ field, kind: temporalKind(field, schema?.properties?.[field]) }))
    .filter((candidate) => candidate.kind !== "time");
  const start = pickTemporalField(candidates, [
    "starts_at",
    "start_at",
    "scheduled_at",
    "opens_at",
    "opens_on",
    "date",
    "start_date",
    "starts_on",
    "expires_at",
  ]) || candidates.find((candidate) => /(^|_)(start|date|open|schedule|expire)/.test(candidate.field)) || candidates[0];
  if (!start) return null;

  const end = pickTemporalField(candidates.filter((candidate) => candidate.field !== start.field), [
    "ends_at",
    "end_at",
    "closes_at",
    "closes_on",
    "end_date",
    "ends_on",
  ]) || candidates.find((candidate) => candidate.field !== start.field && /(^|_)(end|close)/.test(candidate.field));
  const timeField = start.kind === "date" ? pickTimeField(fields, start.field, schema) : "";
  return { startField: start.field, startKind: start.kind, timeField, endField: end?.field || "" };
}

function pickTemporalField(candidates: { field: string; kind: TemporalKind }[], names: string[]) {
  for (const name of names) {
    const exact = candidates.find((candidate) => candidate.field === name);
    if (exact) return exact;
  }
  return null;
}

function pickTimeField(fields: string[], dateField: string, schema: any | null): string {
  const base = dateField.replace(/_?date$/, "").replace(/_?on$/, "");
  const names = [base ? `${base}_time` : "", "starts_time", "start_time", "time"].filter(Boolean);
  for (const name of names) {
    if (fields.includes(name) && temporalKind(name, schema?.properties?.[name]) === "time") return name;
  }
  return "";
}

function temporalKind(field: string, prop: any): TemporalKind {
  const format = fieldFormat(prop);
  if (format === "date" || format === "time" || format === "date-time") return format;
  if (field === "time" || field.endsWith("_time")) return "time";
  if (field === "date" || field.endsWith("_date") || field.endsWith("_on")) return "date";
  return "date-time";
}

function eventFromRow(
  api: ObApi,
  entity: AdminTemporalEntity,
  schema: any,
  descriptor: TemporalDescriptor,
  row: Record<string, unknown>,
  colorIndex: number,
  lookups: Record<string, Map<string, string>>,
): CalendarEvent | null {
  const start = parseTemporalValue(row[descriptor.startField], descriptor.startKind, row[descriptor.timeField]);
  if (!start) return null;
  const end = descriptor.endField
    ? parseTemporalValue(row[descriptor.endField], temporalKind(descriptor.endField, schema.properties?.[descriptor.endField]))
    : endFromDuration(start, row.duration_mins || row.duration_minutes);
  return {
    id: String(row.id || ""),
    entity: entity.entity,
    entityLabel: displayName(entity.entity),
    title: calendarTitleFor(row, schema, descriptor, lookups),
    href: recordHref(api, entity.entity, row.id),
    start,
    end,
    dateKey: dateKey(start),
    timeLabel: timeRangeLabel(start, end, descriptor.startKind === "date" && !descriptor.timeField),
    color: colorIndex % 6,
  };
}

async function loadCalendarLookups(api: ObApi, entity: string, rows: Record<string, unknown>[]): Promise<Record<string, Map<string, string>>> {
  const fks = api.getForeignKeys(entity);
  const relationships = api.getForeignKeyRelationships(entity);
  const lookups: Record<string, Map<string, string>> = {};
  await Promise.all(Object.entries(fks).map(async ([field, targetEntity]) => {
    const ids = [...new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== "").map(String))];
    const pairs = await Promise.all(ids.map(async (id) => {
      const res = await api.request(`/api/${targetEntity}s/${id}`);
      if (!res.ok) return null;
      const row = await res.json();
      if (!api.can(targetEntity, "read", row)) return null;
      return [id, calendarRelationshipLabel(row, relationships[field])] as [string, string];
    }));
    lookups[field] = new Map(pairs.filter((pair): pair is [string, string] => pair !== null));
  }));
  return lookups;
}

function calendarRelationshipLabel(row: Record<string, unknown>, relationship: any): string {
  return labelFor(row);
}

function calendarTitleFor(
  row: Record<string, unknown>,
  schema: any,
  descriptor: TemporalDescriptor,
  lookups: Record<string, Map<string, string>>,
): string {
  const direct = primaryLabelFor(row);
  if (direct) return direct;
  const refs = Object.entries(lookups)
    .map(([field, labels]) => labels.get(String(row[field])))
    .filter((label): label is string => Boolean(label));
  const start = formatValue(descriptor.startField, row[descriptor.startField], schema.properties?.[descriptor.startField]);
  const parts = [...refs, start].filter(Boolean).slice(0, 3);
  return parts.length > 0 ? parts.join(" · ") : labelFor(row);
}

function primaryLabelFor(row: Record<string, unknown>): string {
  return String(row.name || row.email || row.reference || "");
}

function parseTemporalValue(value: unknown, kind: TemporalKind, timeValue?: unknown): Date | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (kind === "date") {
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return parseValidDate(text);
    const [, year, month, day] = match;
    const time = String(timeValue || "").trim();
    if (time) return parseValidDate(`${text}T${normalizeTime(time)}`);
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  if (kind === "time") return null;
  return parseValidDate(text);
}

function parseValidDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`;
  return value;
}

function endFromDuration(start: Date, value: unknown): Date | null {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(start.getTime() + minutes * 60_000);
}

function recordHref(api: ObApi, entity: string, id: unknown): string {
  return api.getAdminWorkspace(entity) ? `#/workspaces/${entity}/${id}` : `#/${entity}s/${id}`;
}

function calendarEventLink(event: CalendarEvent): string {
  return `
    <a class="calendar-event event-color-${event.color}" href="${escapeAttr(event.href)}" title="${escapeAttr(`${event.title} / ${event.entityLabel}`)}">
      <span>${escapeHtml(event.timeLabel)}</span>
      <strong>${escapeHtml(event.title)}</strong>
    </a>
  `;
}

function chooseInitialMonth(events: CalendarEvent[]): string {
  if (events.length === 0) return monthKey(new Date());
  const today = startOfDay(new Date()).getTime();
  const upcoming = events.find((event) => event.start.getTime() >= today);
  return monthKey(upcoming?.start || events[events.length - 1].start);
}

function parseMonthKey(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return startOfMonth(new Date());
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function shiftMonth(value: string, delta: number): string {
  const date = parseMonthKey(value);
  return monthKey(new Date(date.getFullYear(), date.getMonth() + delta, 1));
}

function monthDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = groups.get(event.dateKey) || [];
    list.push(event);
    groups.set(event.dateKey, list);
  }
  return groups;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function fullDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
}

function shortDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
}

function timeRangeLabel(start: Date, end: Date | null, allDay: boolean): string {
  if (allDay) return "All day";
  const startLabel = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(start);
  if (!end) return startLabel;
  const endLabel = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(end);
  return `${startLabel}-${endLabel}`;
}

customElements.define("ob-admin-calendar", ObAdminCalendar);
