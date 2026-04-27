import css_text from "$/v-scroll.js";

const PAD_PX = 0,
  MIN_THUMB_PX = 16,
  WATCHDOG_GAP = 400,
  SCROLL_IDLE_MS = 220;

const clamp = (num, min, max) => Math.min(max, Math.max(min, num));

const addStyle = (root_el) => {
  const old_style = root_el.querySelector("style[data-v-scroll]");
  if (old_style) return;
  const style_el = document.createElement("style");
  style_el.dataset.vScroll = "true";
  style_el.textContent = css_text;
  root_el.append(style_el);
};

const buildTemplate = () => {
  const frag = document.createDocumentFragment(),
    wrap_el = document.createElement("div"),
    slot_el = document.createElement("slot"),
    rail_el = document.createElement("div"),
    bar_el = document.createElement("b");

  wrap_el.className = "s-view";
  wrap_el.part = "view";
  rail_el.className = "s-rail";
  rail_el.part = "rail";
  bar_el.className = "s-bar";
  bar_el.part = "bar";

  wrap_el.append(slot_el);
  rail_el.append(bar_el);
  frag.append(wrap_el, rail_el);

  return { frag, wrap_el, rail_el, bar_el, slot_el };
};

class VScrollElement extends HTMLElement {
  constructor() {
    super();
    const root_el = this.attachShadow({ mode: "open" }),
      { frag, wrap_el, rail_el, bar_el, slot_el } = buildTemplate();

    addStyle(root_el);
    root_el.append(frag);

    this._view_el = wrap_el;
    this._rail_el = rail_el;
    this._bar_el = bar_el;
    this._slot_el = slot_el;
    this._resize_ob = null;
    this._watchdog_id = 0;
    this._scroll_idle_id = 0;
    this._binded = false;
    this._dragging = false;
    this._drag_ptr = -1;
    this._drag_start_y = 0;
    this._start_scroll_top = 0;
    this._bound_nodes = new Set();
    this._onScroll = () => {
      this._markScrolling();
      this._updateThumb();
    };
    this._onSlotChange = () => this._rebindObservedNodes();
    this._onBarDown = (evt) => this._beginDrag(evt);
    this._onBarMove = (evt) => this._draggingMove(evt);
    this._onBarUp = (evt) => this._endDrag(evt);
    this._onNeedUpdate = () => this._updateThumb();
    this.dataset.overflow = "false";
    this.dataset.scrolling = "false";
  }

  connectedCallback() {
    this._bindEvents();
    this._bindObserver();
    this._rebindObservedNodes();
    this._updateThumb();
    this._startWatchdog();
  }

  disconnectedCallback() {
    this._destroy();
  }

  _bindEvents() {
    if (this._binded) return;
    this._binded = true;
    this._view_el.addEventListener("scroll", this._onScroll, { passive: true });
    this._slot_el.addEventListener("slotchange", this._onSlotChange);
    this._bar_el.addEventListener("pointerdown", this._onBarDown);
    this._bar_el.addEventListener("pointermove", this._onBarMove);
    this._bar_el.addEventListener("pointerup", this._onBarUp);
    this._bar_el.addEventListener("pointercancel", this._onBarUp);
  }

  _unbindEvents() {
    if (!this._binded) return;
    this._binded = false;
    this._view_el.removeEventListener("scroll", this._onScroll);
    this._slot_el.removeEventListener("slotchange", this._onSlotChange);
    this._bar_el.removeEventListener("pointerdown", this._onBarDown);
    this._bar_el.removeEventListener("pointermove", this._onBarMove);
    this._bar_el.removeEventListener("pointerup", this._onBarUp);
    this._bar_el.removeEventListener("pointercancel", this._onBarUp);
  }

  _bindObserver() {
    if (this._resize_ob) return;
    this._resize_ob = new ResizeObserver(this._onNeedUpdate);
    this._resize_ob.observe(this._view_el);
  }

  _rebindObservedNodes() {
    if (!this._resize_ob) return;
    this._bound_nodes.forEach((node_el) => this._resize_ob.unobserve(node_el));
    this._bound_nodes.clear();

    const node_list = this._slot_el.assignedElements({ flatten: true });
    node_list.forEach((node_el) => {
      this._bound_nodes.add(node_el);
      this._resize_ob.observe(node_el);
    });
    this._updateThumb();
  }

  _updateThumb() {
    const client_h = this._view_el.clientHeight,
      scroll_h = this._view_el.scrollHeight,
      scroll_max = Math.max(0, scroll_h - client_h),
      has_overflow = scroll_h > client_h + 1;

    this.dataset.overflow = has_overflow ? "true" : "false";

    if (!has_overflow) {
      this.dataset.scrolling = "false";
      this._bar_el.style.height = "0px";
      this._bar_el.style.transform = `translateY(${PAD_PX}px)`;
      return;
    }

    const track_h = Math.max(0, this._rail_el.clientHeight - PAD_PX * 2),
      raw_thumb_h = track_h * (client_h / scroll_h),
      thumb_h = clamp(raw_thumb_h, MIN_THUMB_PX, track_h),
      thumb_max_top = Math.max(0, track_h - thumb_h),
      top_ratio = scroll_max <= 0 ? 0 : this._view_el.scrollTop / scroll_max,
      top_px = PAD_PX + thumb_max_top * top_ratio;

    this._bar_el.style.height = `${thumb_h}px`;
    this._bar_el.style.transform = `translateY(${top_px}px)`;
  }

  _markScrolling() {
    if (this.dataset.overflow !== "true") return;
    this.dataset.scrolling = "true";
    if (this._scroll_idle_id) {
      window.clearTimeout(this._scroll_idle_id);
    }
    this._scroll_idle_id = window.setTimeout(() => {
      if (!this._dragging) {
        this.dataset.scrolling = "false";
      }
      this._scroll_idle_id = 0;
    }, SCROLL_IDLE_MS);
  }

  _beginDrag(evt) {
    if (this.dataset.overflow !== "true") return;
    evt.preventDefault();
    this._dragging = true;
    this._drag_ptr = evt.pointerId;
    this._drag_start_y = evt.clientY;
    this._start_scroll_top = this._view_el.scrollTop;
    this.dataset.dragging = "true";
    this.dataset.scrolling = "true";
    this._bar_el.setPointerCapture(evt.pointerId);
  }

  _draggingMove(evt) {
    if (!this._dragging || evt.pointerId !== this._drag_ptr) return;
    evt.preventDefault();
    const client_h = this._view_el.clientHeight,
      scroll_h = this._view_el.scrollHeight,
      scroll_max = Math.max(0, scroll_h - client_h),
      track_h = Math.max(0, this._rail_el.clientHeight - PAD_PX * 2),
      thumb_h = this._bar_el.offsetHeight,
      thumb_max_top = Math.max(1, track_h - thumb_h),
      px_delta = evt.clientY - this._drag_start_y,
      next_scroll = this._start_scroll_top + (px_delta * scroll_max) / thumb_max_top;

    this._view_el.scrollTop = clamp(next_scroll, 0, scroll_max);
  }

  _endDrag(evt) {
    if (!this._dragging || evt.pointerId !== this._drag_ptr) return;
    this._dragging = false;
    this._drag_ptr = -1;
    this.dataset.dragging = "false";
    this.dataset.scrolling = "false";
    if (this._bar_el.hasPointerCapture(evt.pointerId)) {
      this._bar_el.releasePointerCapture(evt.pointerId);
    }
  }

  _startWatchdog() {
    if (this._watchdog_id) return;
    this._watchdog_id = window.setInterval(() => {
      if (!this.isConnected) this._destroy();
    }, WATCHDOG_GAP);
  }

  _destroy() {
    this._unbindEvents();
    if (this._resize_ob) {
      this._resize_ob.disconnect();
      this._resize_ob = null;
    }
    if (this._watchdog_id) {
      window.clearInterval(this._watchdog_id);
      this._watchdog_id = 0;
    }
    if (this._scroll_idle_id) {
      window.clearTimeout(this._scroll_idle_id);
      this._scroll_idle_id = 0;
    }
    this._bound_nodes.clear();
    this._dragging = false;
    this._drag_ptr = -1;
    this.dataset.dragging = "false";
    this.dataset.scrolling = "false";
  }
}

if (!customElements.get("v-scroll")) {
  customElements.define("v-scroll", VScrollElement);
}
