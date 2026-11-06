import { Dialog } from '../ui/dialog/dialog';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import {
  IncidentCategory,
  Priority,
  ReportStatus,
  RoleSlug,
} from '../data/models';
import {
  ApiAssignment,
  ApiCollaboration,
  ApiComment,
  ApiDiagnosis,
  ApiEvidence,
  ApiHistoryEntry,
  ApiParticipant,
  ApiReport,
  ApiSpecialty,
  ApiStatusEvent,
  ApiWorkLog,
  CollaborationStatus,
  EvidenceStage,
  ReportsApiService,
} from '../data/reports-api.service';
import { Spinner } from '../ui/spinner/spinner';
import { statusLabel } from '../data/report-status';
import {
  ApiUser,
  UsersApiService,
} from '../data/users-api.service';
import { ReportStatusTimeline } from '../report-status-timeline/report-status-timeline';
import { BreadcrumbService } from '../session/breadcrumb.service';
import { RoleSessionService } from '../session/role-session.service';
import { ToastService } from '../ui/toast/toast.service';


const CATEGORIZABLE: ReportStatus[] = [
  'reportada',
  'validada',
  'reabierta',
];

const ASSIGNABLE: ReportStatus[] = [
  'validada',
  'asignada',
  'reabierta',
  'bloqueada',
];

const REOPEN_FROM: ReportStatus[] = [
  'en_validacion',
  'resuelta',
  'cerrada',
];


@Component({
  selector: 'app-report-detail',

  imports: [
    RouterLink,
    Dialog,
    ReportStatusTimeline,
    DatePipe,
    ReactiveFormsModule,
    Spinner,
  ],

  templateUrl: './report-detail.html',
  styleUrl: './report-detail.css',
})
export class ReportDetail implements OnInit, OnDestroy {

  private readonly route = inject(ActivatedRoute);

  private readonly api = inject(ReportsApiService);

  private readonly usersApi = inject(UsersApiService);

  private readonly auth = inject(AuthService);

  private readonly crumbs = inject(BreadcrumbService);

  private readonly toast = inject(ToastService);

  private readonly fb = inject(FormBuilder);

  protected readonly session = inject(RoleSessionService);


  /* =======================================================
     DATOS GENERALES DEL REPORTE
     ======================================================= */

  protected readonly report = signal<ApiReport | null>(null);

  protected readonly loading = signal(true);

  protected readonly notFound = signal(false);

  protected readonly busy = signal(false);
  protected readonly closeDialogOpen = signal(false);
  protected readonly closeDialogError = signal('');

  protected requestClose(): void {
    if (!this.canClose() || this.busy()) return;
    if (this.role() !== 'reportante') { this.move('cerrada'); return; }
    this.closeDialogError.set('');
    this.closeDialogOpen.set(true);
  }

  protected cancelClose(): void {
    if (!this.busy()) this.closeDialogOpen.set(false);
  }

  protected confirmClose(): void {
    if (!this.closeDialogOpen() || !this.canClose() || this.busy()) return;
    this.busy.set(true); this.closeDialogError.set('');
    this.api.changeStatus(this.folio, { status: 'cerrada', comment: this.comment().trim() || null }).subscribe({
      next: item => {
        this.report.set(item); this.comment.set(''); this.busy.set(false);
        this.closeDialogOpen.set(false); this.toast.show('Reporte cerrado');
        this.loadHistory(); this.loadUnifiedHistory();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false); this.closeDialogError.set(this.errorMessage(err));
      },
    });
  }


  protected readonly specialties = signal<ApiSpecialty[]>([]);

  protected readonly technicians = signal<ApiUser[]>([]);

  protected readonly assignments = signal<ApiAssignment[]>([]);

  protected readonly events = signal<ApiStatusEvent[]>([]);

  protected readonly names = signal<Record<number, string>>({});

  /* Signals para Comentarios */
  protected readonly comments = signal<ApiComment[]>([]);
  protected readonly newCommentText = signal('');
  protected readonly editingCommentId = signal<number | null>(null);
  protected readonly editingContent = signal('');

  /* =======================================================
     HU-14 — MENCIONES EN COMENTARIOS
     ======================================================= */

  protected readonly participants = signal<ApiParticipant[]>([]);
  protected readonly mentionQuery = signal<string | null>(null);
  private mentionStart = -1;
  private commentCaret = 0;

  protected readonly mentionCandidates = computed(() => {
    const query = this.mentionQuery();
    if (query === null) {
      return [];
    }
    const normalized = query.trim().toLowerCase();
    return this.participants()
      .filter((person) => person.name.toLowerCase().includes(normalized))
      .slice(0, 6);
  });

  /* =======================================================
     HU-17 — EVIDENCIAS
     ======================================================= */

  protected readonly evidences = signal<ApiEvidence[]>([]);
  protected readonly evidencesLoading = signal(true);
  protected readonly evidenceSaving = signal(false);
  protected readonly evidenceFile = signal<File | null>(null);
  protected readonly evidenceCaption = signal('');
  protected readonly evidenceStage = signal<EvidenceStage | ''>('');

  /* =======================================================
     HU-16 — COLABORACIÓN ENTRE ÁREAS
     ======================================================= */

  protected readonly collaborations = signal<ApiCollaboration[]>([]);
  protected readonly collaborationsLoading = signal(true);
  protected readonly collabSaving = signal(false);
  protected readonly collabCategory = signal<IncidentCategory | ''>('');
  protected readonly collabReason = signal('');

  /* =======================================================
     HU-18 — HISTORIAL UNIFICADO
     ======================================================= */

  protected readonly history = signal<ApiHistoryEntry[]>([]);
  protected readonly historyLoading = signal(true);

  protected readonly category =
    signal<IncidentCategory | ''>('');

  protected readonly priority =
    signal<Priority | ''>('');

  protected readonly assigneeId =
    signal<number | null>(null);
  protected readonly comment = signal('');


  protected readonly statusLabel = statusLabel;


  private folio = '';


  protected readonly role =
    computed<RoleSlug>(() => this.session.currentSlug());


  /* =======================================================
     HU-11 — DIAGNÓSTICO
     ======================================================= */

  protected readonly diagnosis =
    signal<ApiDiagnosis | null>(null);

  protected readonly diagnosisLoading =
    signal(true);

  protected readonly diagnosisSaving =
    signal(false);


  protected readonly diagnosisForm =
    this.fb.nonNullable.group({

      evaluation: [
        '',
        [
          Validators.required,
        ],
      ],

      rootCause: [
        '',
        [
          Validators.required,
        ],
      ],

    });


  /* =======================================================
     HU-12 — BITÁCORA DE ACTIVIDADES
     ======================================================= */

  protected readonly workLogs =
    signal<ApiWorkLog[]>([]);

  protected readonly workLogsLoading =
    signal(true);

  protected readonly workLogSaving =
    signal(false);


  protected readonly workLogForm =
    this.fb.nonNullable.group({

      tasks: [
        '',
        [
          Validators.required,
        ],
      ],

      materials: [
        '',
        [
          Validators.required,
        ],
      ],

      timeMinutes: [
        1,
        [
          Validators.required,
          Validators.min(1),
        ],
      ],

    });


  /* =======================================================
     PERMISOS DEL WORKFLOW EXISTENTE
     ======================================================= */

  protected readonly canCategorize = computed(() => {

    const item = this.report();

    return (
      !!item &&
      this.isRole(
        'responsable',
        'administrador',
      ) &&
      CATEGORIZABLE.includes(item.status)
    );

  });


  protected readonly canAssign = computed(() => {

    const item = this.report();

    return (
      !!item &&
      item.category != null &&
      this.isRole(
        'responsable',
        'coordinador',
        'administrador',
      ) &&
      ASSIGNABLE.includes(item.status)
    );

  });


  protected readonly canValidate = computed(() => {

    const item = this.report();

    return (
      !!item &&
      item.status === 'reportada' &&
      this.isRole(
        'responsable',
        'coordinador',
        'administrador',
      )
    );

  });


  protected readonly canStart =
    computed(() =>
      this.technicianMove(
        'asignada',
        'reabierta',
      )
    );


  protected readonly canSendValidation =
    computed(() =>
      this.technicianMove(
        'en_progreso',
      )
    );


  protected readonly canResolve =
    computed(() =>
      this.technicianMove(
        'en_validacion',
      )
    );


  protected readonly canBlock = computed(() => {

    const item = this.report();

    if (
      !item ||
      (
        item.status !== 'asignada' &&
        item.status !== 'en_progreso'
      )
    ) {
      return false;
    }

    return (
      this.isAssignee() ||
      this.role() === 'responsable'
    );

  });


  protected readonly canUnblock = computed(() => {

    const item = this.report();

    return (
      !!item &&
      item.status === 'bloqueada' &&
      !!this.resumeStatus() &&
      (
        this.isAssignee() ||
        this.role() === 'responsable'
      )
    );

  });


  protected readonly canClose = computed(() => {

    const item = this.report();

    return (
      !!item &&
      item.status === 'resuelta' &&
      (
        this.isAuthor() ||
        this.role() === 'validador'
      )
    );

  });


  protected readonly canReopen = computed(() => {

    const item = this.report();

    return (
      !!item &&
      REOPEN_FROM.includes(item.status) &&
      (item.status !== 'cerrada' || this.role() === 'validador') &&
      (
        this.isAuthor() ||
        this.role() === 'validador'
      )
    );

  });


  protected readonly resumeStatus =
    computed<ReportStatus | null>(() => {

      const blocked =
        this.events().find(
          (event) =>
            event.toStatus === 'bloqueada',
        );

      return blocked?.fromStatus ?? null;

    });


  protected readonly showActions =
    computed(() =>

      this.canCategorize() ||
      this.canAssign() ||
      this.canValidate() ||
      this.canStart() ||
      this.canSendValidation() ||
      this.canResolve() ||
      this.canBlock() ||
      this.canUnblock() ||
      this.canClose() ||
      this.canReopen()

    );


  /* =======================================================
     PERMISO TÉCNICO HU-11 / HU-12
     ======================================================= */

  protected readonly canWriteTechnical =
    computed(() => {

      const item = this.report();

      return (
        !!item &&
        this.role() === 'tecnico' &&
        this.isAssignee()
      );

    });


  /* =======================================================
     PERMISOS HU-16 / HU-17
     ======================================================= */

  protected readonly canAddEvidence = computed(() => {

    const item = this.report();

    return (
      !!item &&
      item.status !== 'cerrada' &&
      (
        this.isAuthor() ||
        this.isAssignee() ||
        this.isRole(
          'tecnico',
          'responsable',
          'coordinador',
          'administrador',
        )
      )
    );

  });


  protected readonly canRequestCollaboration = computed(() => {

    const item = this.report();

    return (
      !!item &&
      item.category != null &&
      (
        item.status === 'asignada' ||
        item.status === 'en_progreso' ||
        item.status === 'bloqueada'
      ) &&
      (
        this.isAssignee() ||
        this.isRole(
          'responsable',
          'coordinador',
          'administrador',
        )
      )
    );

  });


  /* HU-16 — Aceptar o rechazar una colaboración solo corresponde a los roles
     de gestión; quien la solicita no puede aceptar su propia solicitud. */
  protected readonly canRespondCollaborations = computed(() =>

    this.isRole(
      'responsable',
      'coordinador',
      'administrador',
    )

  );

  /* Completar: técnico asignado o roles de gestión. */
  protected readonly canCompleteCollaborations = computed(() =>

    this.isAssignee() ||
    this.canRespondCollaborations()

  );

  /* El solicitante puede retirar su solicitud mientras siga pendiente. */
  protected isCollabRequester(item: ApiCollaboration): boolean {
    return (
      Number(item.requestedById) ===
      Number(this.auth.currentUser()?.id)
    );
  }

  protected hasCollabActions(item: ApiCollaboration): boolean {
    if (item.status === 'solicitada') {
      return (
        this.canRespondCollaborations() ||
        this.isCollabRequester(item)
      );
    }

    if (item.status === 'aceptada') {
      return (
        this.canCompleteCollaborations() ||
        this.canRespondCollaborations()
      );
    }

    return false;
  }


  protected readonly collabSpecialtyOptions = computed(() => {

    const current = this.report()?.category ?? null;

    return this.specialties().filter(
      (item) => item.category !== current,
    );

  });


  /* =======================================================
     INICIALIZACIÓN
     ======================================================= */

  ngOnInit(): void {

    this.folio =
      this.route.snapshot.paramMap.get('id') ?? '';


    this.loadReport();

    this.loadHistory();

    this.loadDiagnosis();

    this.loadWorkLogs();

    this.loadEvidences();

    this.loadCollaborations();

    this.loadUnifiedHistory();

    this.loadParticipants();

    this.api.listSpecialties().subscribe({
      next: (items) => this.specialties.set(items),
      error: () => this.specialties.set([]),
    });

    const currentUser = this.auth.currentUser();
    if (currentUser && currentUser.name) {
      try {
        const known = JSON.parse(localStorage.getItem('known_user_names') || '{}');
        known[Number(currentUser.id)] = currentUser.name;
        localStorage.setItem('known_user_names', JSON.stringify(known));
      } catch {}
    }

    this.usersApi.list().subscribe({
      next: (users) => {
        let known: Record<number, string> = {};
        try {
          known = JSON.parse(localStorage.getItem('known_user_names') || '{}');
        } catch {}

        for (const user of users) {
          known[Number(user.id)] = user.name;
        }
        try {
          localStorage.setItem('known_user_names', JSON.stringify(known));
        } catch {}

        this.names.set(known);
        this.technicians.set(users.filter((user) => user.is_active && user.roles.includes('tecnico')));
        this.loadComments();
      },
      error: () => {
        let known: Record<number, string> = {};
        try {
          known = JSON.parse(localStorage.getItem('known_user_names') || '{}');
        } catch {}

        this.names.set(known);
        this.technicians.set([]);
        this.loadComments();
      },
    });
  }


  ngOnDestroy(): void {

    this.crumbs.reportTitle.set(null);

  }

  /* =======================================================
     FUNCIONES DE APOYO
     ======================================================= */

  protected cleanText(text?: string | null): string {
    if (!text) return '—';
    try {
      return decodeURIComponent(escape(text));
    } catch {
      return text.replace(/Ã³/g, 'ó').replace(/Ã/g, 'á');
    }
  }

  protected locationLines(label?: string): string[] {
    if (!label || !label.trim()) {
      return ['—'];
    }
    return label.split(' - ').map((part) => this.cleanText(part.trim()));
  }

  protected personName(id: number): string {
    const targetId = Number(id);

    const known = this.names();
    if (known[targetId]) {
      return known[targetId];
    }

    const reportItem = this.report();
    if (reportItem && Number(reportItem.authorId) === targetId && reportItem.author?.name) {
      return reportItem.author.name;
    }

    const currentUser = this.auth.currentUser();
    if (currentUser && Number(currentUser.id) === targetId && currentUser.name) {
      return currentUser.name;
    }

    return `Usuario ${id}`;
  }

  protected personInitial(id: number): string {
    const name = this.personName(id);
    if (!name || name.startsWith('Usuario')) return 'U';
    return name.charAt(0).toUpperCase();
  }

  protected formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const formattedStr = dateStr.includes('Z') || dateStr.includes('+') ? dateStr : `${dateStr}Z`;
    return formattedStr;
  }


  protected onCategory(
    event: Event,
  ): void {

    this.category.set(

      (
        event.target as HTMLSelectElement
      ).value as IncidentCategory | '',

    );

  }


  protected onPriority(
    event: Event,
  ): void {

    this.priority.set(

      (
        event.target as HTMLSelectElement
      ).value as Priority | '',

    );

  }


  protected onAssignee(
    event: Event,
  ): void {

    const value =
      Number(
        (
          event.target as HTMLSelectElement
        ).value,
      );


    this.assigneeId.set(

      Number.isFinite(value) &&
      value > 0

        ? value

        : null,

    );

  }


  protected onComment(
    event: Event,
  ): void {

    this.comment.set(

      (
        event.target as HTMLTextAreaElement
      ).value,

    );

  }


  /* =======================================================
     WORKFLOW EXISTENTE
     ======================================================= */

  protected categorize(): void {

    const category =
      this.category();

    const priority =
      this.priority();


    if (
      !category ||
      !priority
    ) {

      this.toast.show(
        'Elige categoría y prioridad.',
      );

      return;

    }


    this.run(

      () =>
        this.api.categorize(
          this.folio,
          {
            category,
            priority,
          },
        ),

      'Incidencia categorizada',

    );

  }


  protected assign(): void {

    const assigneeId =
      this.assigneeId();


    if (!assigneeId) {

      this.toast.show(
        'Elige un técnico.',
      );

      return;

    }


    this.run(

      () =>
        this.api.assign(
          this.folio,
          assigneeId,
        ),

      'Responsable asignado',

    );

  }

  /* --- Funciones de Comentarios --- */
  protected loadComments(): void {
    const item = this.report();
    if (!item) return;

    this.api.getComments(item.id).subscribe({
      next: (items) => this.comments.set(items),
      error: () => this.comments.set([]),
    });
  }

  protected onNewCommentInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.newCommentText.set(target.value);
    this.commentCaret = target.selectionStart ?? target.value.length;
    this.updateMentionContext(target.value);
  }

  /* --- HU-14: Menciones --- */

  /**
   * Detecta si el usuario está escribiendo una mención: busca el último "@"
   * antes del cursor que no tenga espacios después y lo usa como consulta.
   */
  private updateMentionContext(value: string): void {
    const caret = this.commentCaret;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');

    if (at === -1) {
      this.closeMentions();
      return;
    }

    const prev = at > 0 ? before[at - 1] : ' ';
    const token = before.slice(at + 1);

    if ((prev !== ' ' && prev !== '\n' && at !== 0) || token.includes('\n') || token.length > 40) {
      this.closeMentions();
      return;
    }

    this.mentionStart = at;
    this.mentionQuery.set(token);
  }

  protected closeMentions(): void {
    this.mentionStart = -1;
    this.mentionQuery.set(null);
  }

  protected insertMention(person: ApiParticipant): void {
    if (this.mentionStart < 0) {
      return;
    }

    const value = this.newCommentText();
    const before = value.slice(0, this.mentionStart);
    const after = value.slice(this.commentCaret);
    const inserted = `@${person.name} `;

    this.newCommentText.set(`${before}${inserted}${after}`);
    this.commentCaret = before.length + inserted.length;
    this.closeMentions();
  }

  /** IDs de los participantes cuyo @Nombre aparece en el texto. */
  private mentionIdsIn(text: string): number[] {
    return this.participants()
      .filter((person) => text.includes(`@${person.name}`))
      .map((person) => person.id);
  }

  /**
   * Divide el contenido de un comentario en segmentos para resaltar
   * las menciones registradas (HU-14).
   */
  protected commentSegments(c: ApiComment): { text: string; mention: boolean }[] {
    const names = (c.mentions ?? [])
      .map((person) => `@${person.name}`)
      .sort((a, b) => b.length - a.length);

    if (!names.length) {
      return [{ text: c.content, mention: false }];
    }

    let segments: { text: string; mention: boolean }[] = [
      { text: c.content, mention: false },
    ];

    for (const name of names) {
      const next: { text: string; mention: boolean }[] = [];

      for (const segment of segments) {
        if (segment.mention || !segment.text.includes(name)) {
          next.push(segment);
          continue;
        }

        const parts = segment.text.split(name);
        parts.forEach((part, index) => {
          if (index > 0) {
            next.push({ text: name, mention: true });
          }
          if (part) {
            next.push({ text: part, mention: false });
          }
        });
      }

      segments = next;
    }

    return segments;
  }

  protected onEditCommentInput(event: Event): void {
    this.editingContent.set((event.target as HTMLTextAreaElement).value);
  }

  protected addComment(): void {
    const text = this.newCommentText().trim();
    const item = this.report();

    if (!text) {
      this.toast.show('Escribe un comentario antes de publicar.');
      return;
    }
    if (!item) return;

    this.busy.set(true);
    this.api.createComment(item.id, text, this.mentionIdsIn(text)).subscribe({
      next: () => {
        this.newCommentText.set('');
        this.closeMentions();
        this.busy.set(false);
        this.toast.show('Comentario publicado');
        this.loadComments();
        this.loadUnifiedHistory();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show(this.errorMessage(err));
      },
    });
  }

  protected startEditComment(c: ApiComment): void {
    this.editingCommentId.set(c.id);
    this.editingContent.set(c.content);
  }

  protected cancelEditComment(): void {
    this.editingCommentId.set(null);
    this.editingContent.set('');
  }

  protected saveEditComment(commentId: number): void {
    const text = this.editingContent().trim();
    if (!text) return;

    this.busy.set(true);
    this.api.updateComment(commentId, text).subscribe({
      next: () => {
        this.editingCommentId.set(null);
        this.editingContent.set('');
        this.busy.set(false);
        this.toast.show('Comentario actualizado');
        this.loadComments();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show(this.errorMessage(err));
      },
    });
  }

  protected deleteComment(commentId: number): void {
    if (!confirm('¿Deseas eliminar este comentario?')) return;

    this.busy.set(true);
    this.api.deleteComment(commentId).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show('Comentario eliminado');
        this.loadComments();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.show(this.errorMessage(err));
      },
    });
  }

  /* Edición exclusiva para el autor del comentario */
  protected canEditComment(c: ApiComment): boolean {
    const user = this.auth.currentUser();
    if (!user) return false;
    return Number(c.userId) === Number(user.id);
  }

  /* Eliminación para el autor O administradores de la plataforma */
  protected canDeleteComment(c: ApiComment): boolean {
    const user = this.auth.currentUser();
    if (!user) return false;

    const isOwner = Number(c.userId) === Number(user.id);
    const currentSlug = this.role();
    const isAdmin = currentSlug === 'administrador' || user.roles?.includes('administrador');

    return isOwner || isAdmin;
  }

  protected move(
    status: ReportStatus,
    needsComment = false,
  ): void {

    const comment =
      this.comment().trim();


    if (
      needsComment &&
      !comment
    ) {

      this.toast.show(
        'Escribe un comentario para esta acción.',
      );

      return;

    }


    this.run(

      () =>
        this.api.changeStatus(
          this.folio,
          {
            status,
            comment:
              comment || null,
          },
        ),

      'Estado actualizado',

    );

  }


  /* =======================================================
     HU-11 — REGISTRAR DIAGNÓSTICO
     ======================================================= */

  protected submitDiagnosis(): void {

    if (
      this.diagnosisSaving() ||
      this.diagnosisForm.invalid
    ) {

      this.diagnosisForm.markAllAsTouched();

      return;

    }


    const values =
      this.diagnosisForm.getRawValue();


    this.diagnosisSaving.set(true);


    this.api
      .createDiagnosis(
        this.folio,
        {
          evaluation:
            values.evaluation.trim(),

          rootCause:
            values.rootCause.trim(),
        },
      )
      .subscribe({

        next: (diagnosis) => {

          this.diagnosis.set(
            diagnosis,
          );

          this.diagnosisSaving.set(
            false,
          );

          this.diagnosisForm.reset({

            evaluation: '',

            rootCause: '',

          });


          this.toast.show(
            'Diagnóstico registrado',
          );

        },


        error: (
          err: HttpErrorResponse,
        ) => {

          this.diagnosisSaving.set(
            false,
          );

          this.toast.show(
            this.errorMessage(err),
          );

        },

      });

  }


  /* =======================================================
     HU-12 — REGISTRAR ACTIVIDAD
     ======================================================= */

  protected submitWorkLog(): void {

    if (
      this.workLogSaving() ||
      this.workLogForm.invalid
    ) {

      this.workLogForm.markAllAsTouched();

      return;

    }


    const values =
      this.workLogForm.getRawValue();


    this.workLogSaving.set(true);


    this.api
      .createWorkLog(
        this.folio,
        {
          tasks:
            values.tasks.trim(),

          materials:
            values.materials.trim(),

          timeMinutes:
            values.timeMinutes,
        },
      )
      .subscribe({

        next: (workLog) => {

          this.workLogs.update(
            (items) => [
              ...items,
              workLog,
            ],
          );


          this.workLogSaving.set(
            false,
          );


          this.workLogForm.reset({

            tasks: '',

            materials: '',

            timeMinutes: 1,

          });


          this.toast.show(
            'Actividad registrada',
          );

        },


        error: (
          err: HttpErrorResponse,
        ) => {

          this.workLogSaving.set(
            false,
          );

          this.toast.show(
            this.errorMessage(err),
          );

        },

      });

  }


  /* =======================================================
     PERMISOS
     ======================================================= */

  private technicianMove(
    ...from: ReportStatus[]
  ): boolean {

    const item =
      this.report();


    return (
      !!item &&
      this.role() === 'tecnico' &&
      this.isAssignee() &&
      from.includes(item.status)
    );

  }


  private isAssignee(): boolean {
    const item = this.report();
    return !!item && Number(item.assigneeId) === Number(this.auth.currentUser()?.id);
  }


  private isAuthor(): boolean {
    const item = this.report();
    return !!item && Number(item.authorId) === Number(this.auth.currentUser()?.id);
  }


  private isRole(
    ...roles: RoleSlug[]
  ): boolean {

    return roles.includes(
      this.role(),
    );

  }


  /* =======================================================
     CARGA DEL REPORTE
     ======================================================= */

  private loadReport(): void {
    this.api.getByFolio(this.folio).subscribe({
      next: (item) => {
        this.report.set(item);
        this.crumbs.reportTitle.set(item.title);
        if (item.category) {
          this.category.set(item.category);
        }
        if (item.priority) {
          this.priority.set(item.priority);
        }
        if (item.assigneeId) {
          this.assigneeId.set(item.assigneeId);
        }
        this.loading.set(false);
        this.loadComments();
      },
      error: (err: HttpErrorResponse) => {
        this.notFound.set(err.status === 404);
        this.loading.set(false);
      },
    });
  }


  /* =======================================================
     HISTORIAL HU-09 / HU-10
     ======================================================= */

  private loadHistory(): void {

    this.api
      .listAssignments(
        this.folio,
      )
      .subscribe({

        next: (rows) =>
          this.assignments.set(rows),

        error: () =>
          this.assignments.set([]),

      });


    this.api
      .listStatusEvents(
        this.folio,
      )
      .subscribe({

        next: (rows) =>
          this.events.set(rows),

        error: () =>
          this.events.set([]),

      });

  }


  /* =======================================================
     CARGA HU-11
     ======================================================= */

  private loadDiagnosis(): void {

    this.diagnosisLoading.set(
      true,
    );


    this.api
      .getDiagnosis(
        this.folio,
      )
      .subscribe({

        next: (diagnosis) => {

          this.diagnosis.set(
            diagnosis,
          );

          this.diagnosisLoading.set(
            false,
          );

        },


        error: (
          err: HttpErrorResponse,
        ) => {

          if (err.status === 404) {

            this.diagnosis.set(
              null,
            );

          }


          this.diagnosisLoading.set(
            false,
          );

        },

      });

  }


  /* =======================================================
     CARGA HU-12
     ======================================================= */

  private loadWorkLogs(): void {

    this.workLogsLoading.set(
      true,
    );


    this.api
      .listWorkLogs(
        this.folio,
      )
      .subscribe({

        next: (rows) => {

          this.workLogs.set(
            rows,
          );

          this.workLogsLoading.set(
            false,
          );

        },


        error: () => {

          this.workLogs.set(
            [],
          );

          this.workLogsLoading.set(
            false,
          );

        },

      });

  }


  /* =======================================================
     HU-17 — EVIDENCIAS
     ======================================================= */

  private loadEvidences(): void {
    this.evidencesLoading.set(true);

    this.api.listEvidences(this.folio).subscribe({
      next: (rows) => {
        this.evidences.set(rows);
        this.evidencesLoading.set(false);
      },
      error: () => {
        this.evidences.set([]);
        this.evidencesLoading.set(false);
      },
    });
  }

  protected onEvidenceFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.evidenceFile.set(input.files?.[0] ?? null);
  }

  protected onEvidenceCaption(event: Event): void {
    this.evidenceCaption.set((event.target as HTMLInputElement).value);
  }

  protected onEvidenceStage(event: Event): void {
    this.evidenceStage.set(
      (event.target as HTMLSelectElement).value as EvidenceStage | '',
    );
  }

  protected submitEvidence(): void {
    const file = this.evidenceFile();

    if (!file) {
      this.toast.show('Selecciona una fotografía o documento.');
      return;
    }

    if (this.evidenceSaving()) {
      return;
    }

    this.evidenceSaving.set(true);

    this.api
      .createEvidence(
        this.folio,
        file,
        this.evidenceCaption().trim() || null,
        this.evidenceStage() || null,
      )
      .subscribe({
        next: () => {
          this.evidenceSaving.set(false);
          this.evidenceFile.set(null);
          this.evidenceCaption.set('');
          this.evidenceStage.set('');
          this.toast.show('Evidencia adjuntada');
          this.loadEvidences();
          this.loadUnifiedHistory();
        },
        error: (err: HttpErrorResponse) => {
          this.evidenceSaving.set(false);
          this.toast.show(this.errorMessage(err));
        },
      });
  }

  protected isPdf(url: string): boolean {
    return url.toLowerCase().endsWith('.pdf');
  }

  protected stageLabel(stage: EvidenceStage | null): string {
    switch (stage) {
      case 'antes':
        return 'Antes';
      case 'durante':
        return 'Durante';
      case 'despues':
        return 'Después';
      default:
        return 'Evidencia';
    }
  }

  /* =======================================================
     HU-16 — COLABORACIÓN ENTRE ÁREAS
     ======================================================= */

  private loadCollaborations(): void {
    this.collaborationsLoading.set(true);

    this.api.listCollaborations(this.folio).subscribe({
      next: (rows) => {
        this.collaborations.set(rows);
        this.collaborationsLoading.set(false);
      },
      error: () => {
        this.collaborations.set([]);
        this.collaborationsLoading.set(false);
      },
    });
  }

  protected onCollabCategory(event: Event): void {
    this.collabCategory.set(
      (event.target as HTMLSelectElement).value as IncidentCategory | '',
    );
  }

  protected onCollabReason(event: Event): void {
    this.collabReason.set((event.target as HTMLTextAreaElement).value);
  }

  protected submitCollaboration(): void {
    const category = this.collabCategory();
    const reason = this.collabReason().trim();

    if (!category) {
      this.toast.show('Elige la especialidad a la que pides apoyo.');
      return;
    }

    if (!reason) {
      this.toast.show('Describe la razón de la colaboración.');
      return;
    }

    if (this.collabSaving()) {
      return;
    }

    this.collabSaving.set(true);

    this.api.requestCollaboration(this.folio, { category, reason }).subscribe({
      next: () => {
        this.collabSaving.set(false);
        this.collabCategory.set('');
        this.collabReason.set('');
        this.toast.show('Colaboración solicitada');
        this.loadCollaborations();
        this.loadUnifiedHistory();
      },
      error: (err: HttpErrorResponse) => {
        this.collabSaving.set(false);
        this.toast.show(this.errorMessage(err));
      },
    });
  }

  protected setCollaborationStatus(
    collaboration: ApiCollaboration,
    statusValue: CollaborationStatus,
  ): void {
    if (this.collabSaving()) {
      return;
    }

    this.collabSaving.set(true);

    this.api.updateCollaborationStatus(collaboration.id, statusValue).subscribe({
      next: () => {
        this.collabSaving.set(false);
        this.toast.show('Colaboración actualizada');
        this.loadCollaborations();
        this.loadUnifiedHistory();
      },
      error: (err: HttpErrorResponse) => {
        this.collabSaving.set(false);
        this.toast.show(this.errorMessage(err));
      },
    });
  }

  protected collabStatusLabel(statusValue: CollaborationStatus): string {
    switch (statusValue) {
      case 'solicitada':
        return 'Solicitada';
      case 'aceptada':
        return 'Aceptada';
      case 'completada':
        return 'Completada';
      case 'rechazada':
        return 'Rechazada';
    }
  }

  /* =======================================================
     HU-18 — HISTORIAL UNIFICADO
     ======================================================= */

  private loadUnifiedHistory(): void {
    this.historyLoading.set(true);

    this.api.getHistory(this.folio).subscribe({
      next: (rows) => {
        this.history.set(rows);
        this.historyLoading.set(false);
      },
      error: () => {
        // Respaldo: construye el historial con los eventos de estado y
        // asignaciones ya cargados si el endpoint unificado no responde.
        this.history.set(this.fallbackHistory());
        this.historyLoading.set(false);
      },
    });
  }

  private fallbackHistory(): ApiHistoryEntry[] {
    const entries: ApiHistoryEntry[] = [];

    for (const event of this.events()) {
      entries.push({
        type: 'estado',
        timestamp: event.createdAt,
        actorId: event.actorId,
        actorName: this.personName(event.actorId),
        summary: `${this.personName(event.actorId)} cambió el estado de ${statusLabel(event.fromStatus)} a ${statusLabel(event.toStatus)}${event.comment ? `: ${event.comment}` : ''}`,
      });
    }

    for (const row of this.assignments()) {
      entries.push({
        type: 'asignacion',
        timestamp: row.assignedAt,
        actorId: row.assignedById,
        actorName: this.personName(row.assignedById),
        summary: `${this.personName(row.assignedById)} asignó la incidencia a ${this.personName(row.assigneeId)}`,
      });
    }

    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  protected historyTypeLabel(type: string): string {
    switch (type) {
      case 'creacion':
        return 'Creación';
      case 'estado':
        return 'Estado';
      case 'asignacion':
        return 'Asignación';
      case 'comentario':
        return 'Comentario';
      case 'diagnostico':
        return 'Diagnóstico';
      case 'actividad':
        return 'Bitácora';
      case 'evidencia':
        return 'Evidencia';
      case 'colaboracion':
        return 'Colaboración';
      default:
        return 'Evento';
    }
  }

  /* =======================================================
     PARTICIPANTES (para menciones HU-14)
     ======================================================= */

  private loadParticipants(): void {
    this.api.listParticipants(this.folio).subscribe({
      next: (rows) => this.participants.set(rows),
      error: () => this.fallbackParticipants(),
    });
  }

  private fallbackParticipants(): void {
    const map = new Map<number, string>();
    const item = this.report();

    if (item) {
      map.set(Number(item.authorId), item.author?.name ?? this.personName(item.authorId));
      if (item.assigneeId) {
        map.set(Number(item.assigneeId), this.personName(item.assigneeId));
      }
    }

    for (const c of this.comments()) {
      map.set(Number(c.userId), c.author?.name ?? this.personName(c.userId));
    }

    this.participants.set(
      [...map.entries()].map(([id, name]) => ({ id, name })),
    );
  }

  protected initialOf(name: string): string {
    const trimmed = (name ?? '').trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'U';
  }

  /* =======================================================
     OPERACIONES GENERALES DEL WORKFLOW
     ======================================================= */

  private run(
    request:
      () =>
        ReturnType<
          ReportsApiService['changeStatus']
        >,
    success: string,
  ): void {

    if (this.busy()) {

      return;

    }


    this.busy.set(
      true,
    );


    request()
      .subscribe({

        next: (item) => {

          this.report.set(
            item,
          );


          this.comment.set(
            '',
          );


          this.busy.set(
            false,
          );


          this.toast.show(
            success,
          );


          this.loadHistory();

          this.loadUnifiedHistory();

        },


        error: (
          err: HttpErrorResponse,
        ) => {

          this.busy.set(
            false,
          );


          this.toast.show(
            this.errorMessage(err),
          );

        },

      });

  }


  /* =======================================================
     MENSAJES DE ERROR
     ======================================================= */

  private errorMessage(
    err: HttpErrorResponse,
  ): string {

    const detail =
      err.error?.detail;


    if (
      typeof detail === 'string'
    ) {

      return detail;

    }


    if (
      Array.isArray(detail)
    ) {

      const text =
        detail
          .map(
            (item) =>
              typeof item?.msg ===
              'string'

                ? item.msg

                : '',
          )
          .filter(Boolean)
          .join(' ');


      if (text) {

        return text;

      }

    }


    return (
      'No se pudo completar la acción.'
    );

  }

}