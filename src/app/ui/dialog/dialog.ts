import { afterRenderEffect, Component, DestroyRef, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { LucideX } from '@lucide/angular';

@Component({
  selector: 'app-dialog',
  imports: [LucideX],
  templateUrl: './dialog.html',
  styleUrl: './dialog.css',
})
export class Dialog {
  readonly open = input(false);
  readonly title = input('');
  readonly showClose = input(true);
  readonly layer = input<'default' | 'confirm'>('default');
  readonly titleId = input('app-dialog-title');
  readonly variant = input<'default' | 'impediment'>('default');
  readonly closeDisabled = input(false);
  readonly manageFocus = input(false);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private returnFocus: HTMLElement | null = null;

  constructor() {
    afterRenderEffect(() => {
      if (!this.manageFocus()) return;
      const panel = this.panel()?.nativeElement;
      if (panel && !this.returnFocus) {
        this.returnFocus = panel.ownerDocument.activeElement as HTMLElement;
        (panel.querySelector<HTMLElement>('[data-initial-focus]') ?? panel).focus();
      } else if (!panel) {
        this.restoreFocus();
      }
    });
    inject(DestroyRef).onDestroy(() => this.restoreFocus());
  }

  private restoreFocus(): void {
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.manageFocus()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
    if (event.key !== 'Tab') return;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = panel.ownerDocument.activeElement;
    if (!first) { event.preventDefault(); panel.focus(); }
    else if (event.shiftKey && (active === first || active === panel)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || active === panel)) { event.preventDefault(); first.focus(); }
  }

  readonly closed = output<void>();

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  protected close(): void {
    if (!this.closeDisabled()) this.closed.emit();
  }
}
