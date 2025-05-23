import { getDayFromDate } from '../../utils/getDayFromDate';
import { isTodayAfter } from '../../utils/isTodayAfter';
import { registerCustomCard } from '../../utils/registerCustomCard';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TRASH_CARD_EDITOR_NAME, TRASH_CARD_NAME } from './const';
import { Debugger } from '../../utils/debugger';
import { getCalendarData } from '../../utils/getCalendarData';
import { getTimeZoneOffset } from '../../utils/getTimeZoneOffset';
import { fireEvent } from '../../utils/fireEvent';
import { hasEntities } from '../../utils/hasEntities';

import './container';
import './items/empty';

import type { PropertyValues } from 'lit';
import type { TrashCardConfig } from './trash-card-config';
import type { HomeAssistant } from '../../utils/ha';
import type { CalendarItem } from '../../utils/calendarItem';
import type { BaseContainerElement } from './container/BaseContainerElement';

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface HASSDomEvents {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'card-visibility-changed': { value: boolean };
  }
}

registerCustomCard({
  type: TRASH_CARD_NAME,
  name: 'TrashCard',
  description: 'TrashCard - indicates what type of trash will be picked up next based on your calendar entries 🗑️'
});

const configDefaults = {
  tap_action: {
    action: 'more-info'
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  hold_action: {
    action: 'more-info'
  },
  with_label: true,
  debug: false
};

@customElement(TRASH_CARD_NAME)
export class TrashCard extends LitElement {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  @state() private _hass?: HomeAssistant;

  public static async getConfigElement () {
    await import('./trash-card-editor');

    return document.createElement(TRASH_CARD_EDITOR_NAME);
  }

  public static async getStubConfig (hass: HomeAssistant): Promise<Partial<TrashCardConfig>> {
    const entities = Object.keys(hass.states);

    return {
      type: `custom:${TRASH_CARD_NAME}`,
      entities: [ entities[0] ]
    };
  }

  @state() private config?: TrashCardConfig;

  @property() private currentItems?: CalendarItem[];

  @property() private startDate: Date = new Date();

  @property() private endDate: Date = new Date();

  @property() private debugger?: Debugger;

  @property({ type: Boolean }) public preview = false;

  protected element?: BaseContainerElement;

  private lastChanged?: Date;

  public get hass (): HomeAssistant | undefined {
    // eslint-disable-next-line no-underscore-dangle
    return this._hass;
  }

  public set hass (hass: HomeAssistant) {
    // eslint-disable-next-line no-underscore-dangle
    this._hass = hass;
    this.shadowRoot?.querySelectorAll('div > *').forEach((element: unknown) => {
      // eslint-disable-next-line no-param-reassign
      (element as BaseContainerElement).setHass(hass);
    });
  }

  public setConfig (config: TrashCardConfig): void {
    this.config = {
      ...configDefaults,
      ...config
    };

    this.debugger = new Debugger();
  }

  public setDateRange () {
    this.startDate = new Date();
    this.endDate = new Date();

    this.endDate.setDate(this.endDate.getDate() + (this.config?.next_days ?? 2) + 1);
  }

  protected fetchCurrentTrashData () {
    if (!this.hass || !this.config || !this.debugger || !hasEntities(this.config.entities)) {
      return;
    }

    this.setDateRange();

    const start = getDayFromDate(this.startDate);
    const end = getDayFromDate(this.endDate);

    const dropAfter = isTodayAfter(new Date(), this.config.drop_todayevents_from ?? '10:00:00');
    const timezoneOffset = getTimeZoneOffset();

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    getCalendarData(
      this.hass,
      this.config.entities,
      { start, end, dropAfter },
      this.debugger,
      this.config,
      timezoneOffset
    ).
      then((data: CalendarItem[]) => {
        this.currentItems = data;
        this.lastChanged = new Date();
      }).
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      catch(() => {});
  }

  protected getRefreshRate (): number {
    return (this.config?.refresh_rate ?? 60) * 60 * 1_000;
  }

  protected shouldUpdate (changedProps: PropertyValues): boolean {
    super.updated(changedProps);

    if (changedProps.has('currentItems')) {
      return true;
    }

    changedProps.delete('currentItems');

    if (!this.lastChanged || changedProps.has('config') || Date.now() - this.lastChanged.getTime() > this.getRefreshRate()) {
      this.fetchCurrentTrashData();
    }

    if (changedProps.has('preview')) {
      return true;
    }

    if (changedProps.has('hass') || changedProps.has('_hass')) {
      const { language, themes } = changedProps.get('_hass');

      if (language !== this.hass?.language) {
        return true;
      }
      if (themes.theme !== this.hass?.themes.theme) {
        return true;
      }
      if (themes.darkMode !== this.hass?.themes.darkMode) {
        return true;
      }

      return false;
    }

    return false;
  }

  protected update (changedProps: PropertyValues) {
    super.update(changedProps);

    if (!this.preview && hasEntities(this.config!.entities) && (!this.currentItems || this.currentItems.length === 0)) {
      this.style.display = 'none';
      this.toggleAttribute('hidden', true);
      fireEvent(this, 'card-visibility-changed', { value: false });

      return;
    }

    this.style.display = 'block';
    this.toggleAttribute('hidden', false);
    fireEvent(this, 'card-visibility-changed', { value: true });
  }

  protected render () {
    if (!this.config || !this.hass) {
      return nothing;
    }

    const cardStyle = this.config.card_style;

    if (cardStyle === 'chip') {
      return html`<trash-card-chips-container 
        .config=${this.config} 
        .items=${this.currentItems} 
        .hass=${this.hass}
      ></trash-card-chips-container>`;
    }
    if (cardStyle === 'icon') {
      return html`<trash-card-icons-container 
        .config=${this.config} 
        .items=${this.currentItems} 
        .hass=${this.hass}
      ></trash-card-icons-container>`;
    }

    return html`<trash-card-cards-container 
      .config=${this.config} 
      .items=${this.currentItems} 
      .hass=${this.hass}
    ></trash-card-cards-container>`;
  }
}
