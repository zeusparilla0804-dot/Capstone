import { DOCUMENT } from '@angular/common';
import { AfterViewChecked, booleanAttribute, Directive, ElementRef, inject, input, OnDestroy, Renderer2 } from '@angular/core';

/** Changes only the visible mask; the native input retains editing and password semantics. */
@Directive({ selector: 'input[appAsteriskPassword]' })
export class AsteriskPasswordDirective implements AfterViewChecked, OnDestroy {
  readonly enabled = input(true, { alias: 'appAsteriskPassword', transform: booleanAttribute });
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);
  private mask?: HTMLElement;
  private text?: HTMLElement;
  private foreground = '';
  private readonly originalStyles = new Map<string, { value: string; priority: string }>();
  private readonly cleanups: (() => void)[] = [];
  private observer?: MutationObserver;
  private resizeObserver?: ResizeObserver;
  private initialized = false;

  ngAfterViewChecked(): void {
    if (!this.initialized) {
      this.initialized = true;
      for (const event of ['input', 'change', 'scroll', 'keyup', 'select', 'focus', 'blur']) {
        this.cleanups.push(this.renderer.listen(this.element, event, () => this.sync()));
      }
      const view = this.document.defaultView;
      if (view) {
        this.cleanups.push(this.renderer.listen(view, 'resize', () => this.sync()));
        this.observer = new view.MutationObserver(() => this.sync());
        this.observer.observe(this.element, { attributes: true, attributeFilter: ['type', 'value'] });
      }
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.sync());
        this.resizeObserver.observe(this.element);
      }
    }
    this.sync();
  }

  private sync(): void {
    const input = this.element;
    const view = this.document.defaultView;
    // Native password glyph widths vary across mobile browsers; keep their mask and caret together.
    const touchDevice = !!view && ((view.navigator.maxTouchPoints ?? 0) > 0
      || view.matchMedia?.('(any-pointer: coarse)').matches === true);
    if (!view || touchDevice || !this.enabled() || input.type !== 'password' || !input.value) {
      this.clearMask();
      return;
    }
    const style = view.getComputedStyle(input);
    if (!this.mask) {
      this.foreground = style.color;
      this.mask = this.renderer.createElement('span') as HTMLElement;
      this.mask.className = 'password-field__mask';
      this.mask.setAttribute('aria-hidden', 'true');
      this.mask.style.cssText = 'position:absolute;z-index:1;top:50%;transform:translateY(-50%);overflow:hidden;pointer-events:none;user-select:none;white-space:pre;text-align:left;';
      this.text = this.renderer.createElement('span') as HTMLElement;
      this.text.style.display = 'block';
      this.renderer.appendChild(this.mask, this.text);
      this.renderer.appendChild(input.parentElement, this.mask);
      // Only native masking glyphs are made transparent; the real value stays in type=password.
      for (const [property, value] of [
        // Matching fixed-width glyphs keep the native caret and visible asterisks aligned on phones too.
        ['font-family', 'monospace'],
        ['color', 'transparent'], ['-webkit-text-fill-color', 'transparent'],
        ['text-shadow', 'none'], ['caret-color', style.caretColor === 'auto' ? this.foreground : style.caretColor],
      ]) {
        this.originalStyles.set(property!, { value: input.style.getPropertyValue(property!), priority: input.style.getPropertyPriority(property!) });
        input.style.setProperty(property!, value!);
      }
    }
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    this.mask.style.left = `${input.offsetLeft + input.clientLeft + paddingLeft}px`;
    this.mask.style.width = `${Math.max(0, input.clientWidth - paddingLeft - paddingRight)}px`;
    this.mask.style.top = `${input.offsetTop + input.offsetHeight / 2}px`;
    this.mask.style.color = this.foreground;
    const maskStyle = view.getComputedStyle(input);
    for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing']) {
      this.mask.style.setProperty(property, maskStyle.getPropertyValue(property));
    }
    // The extra DOM text contains asterisks only, never the password or a value attribute.
    this.text!.textContent = '*'.repeat(Array.from(input.value).length);
    this.text!.style.transform = `translateX(${-input.scrollLeft}px)`;
  }

  private clearMask(): void {
    this.mask?.remove();
    this.mask = undefined;
    this.text = undefined;
    for (const [property, original] of this.originalStyles) {
      if (original.value) this.element.style.setProperty(property, original.value, original.priority);
      else this.element.style.removeProperty(property);
    }
    this.originalStyles.clear();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    this.cleanups.forEach(cleanup => cleanup());
    this.clearMask();
  }
}
