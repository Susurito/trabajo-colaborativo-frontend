import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportCard } from '../report-card/report-card';
import {
  ApiReport,
  CreateApiReportInput,
  ReportsApiService,
} from '../data/reports-api.service';
import {
  Campus,
  CatalogApiService,
  Faculty,
  Location,
} from '../data/catalog-api.service';
import { ROLES, roleSlugToBackend } from '../data/roles';
import { ApiUser, UsersApiService } from '../data/users-api.service';
import { RoleSlug } from '../data/models';
import { statusLabel as labelForStatus } from '../data/report-status';
import { RoleSessionService } from '../session/role-session.service';
import { AuthService } from '../auth/auth.service';
import { HomeSearchService } from '../session/home-search.service';
import { ConfirmService } from '../ui/confirm/confirm.service';
import { Dialog } from '../ui/dialog/dialog';
import { ToastService } from '../ui/toast/toast.service';
import { Spinner } from '../ui/spinner/spinner';
import { RecentActivity } from '../recent-activity/recent-activity';
import {
  LucideCamera,
  LucideEye,
  LucideHistory,
  LucideLink,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
  LucideUpload,
  LucideX,
} from '@lucide/angular';

type AdminContext = 'usuarios' | 'roles' | 'espacios';
type CatalogContext = 'campus' | 'faculty' | 'location';
type ImageSource = 'none' | 'url' | 'file' | 'camera';
type DialogMode = 'create' | 'edit';
type CatalogDialogMode = 'create' | 'edit';

@Component({
  selector: 'app-home',
  imports: [
    ReportCard,
    Dialog,
    ReactiveFormsModule,
    RouterLink,
    LucideCamera,
    LucideEye,
    LucideHistory,
    LucideLink,
    LucidePencil,
    LucidePlus,
    LucideTrash2,
    LucideUpload,
    LucideX,
    RecentActivity,
    Spinner,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReportsApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly auth = inject(AuthService);
  private readonly homeSearch = inject(HomeSearchService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly session = inject(RoleSessionService);

  protected readonly pageSize = 10;
  protected readonly roles = ROLES;
  protected readonly dialogOpen = signal(false);
  protected readonly dialogMode = signal<DialogMode>('create');
  protected readonly editingFolio = signal<string | null>(null);
  protected readonly deleteTarget = signal<ApiReport | null>(null);
  protected readonly createdTitle = signal<string | null>(null);
  protected readonly createdFolio = signal<string | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly adminContext = signal<AdminContext>('usuarios');
  protected readonly catalogContext = signal<CatalogContext>('campus');
  protected readonly page = signal(1);
  protected readonly imageSource = signal<ImageSource>('none');
  protected readonly imagePreviewUrl = signal<string | null>(null);
  protected readonly selectedImageFile = signal<File | null>(null);
  protected readonly imageError = signal<string | null>(null);
  protected readonly users = signal<ApiUser[]>([]);
  protected readonly usersLoading = signal(false);
  protected readonly usersError = signal<string | null>(null);
  protected readonly userRoleDrafts = signal<Record<number, string[]>>({});
  protected readonly savingUserId = signal<number | null>(null);
  protected readonly userSaveError = signal<string | null>(null);

  protected readonly campuses = signal<Campus[]>([]);
  protected readonly faculties = signal<Faculty[]>([]);
  protected readonly locations = signal<Location[]>([]);
  protected readonly catalogLoading = signal(false);
  protected readonly catalogError = signal<string | null>(null);
  protected readonly catalogDialogOpen = signal(false);
  protected readonly catalogDialogMode = signal<CatalogDialogMode>('create');
  protected readonly catalogDialogType = signal<CatalogContext>('campus');
  protected readonly catalogEditingId = signal<number | null>(null);
  protected readonly catalogSubmitError = signal<string | null>(null);
  protected readonly catalogSubmitting = signal(false);
  protected readonly catalogDeleteType = signal<CatalogContext>('campus');
  protected readonly catalogDeleteId = signal<number | null>(null);
  protected readonly catalogDeleteLabel = signal('');

  protected readonly showWelcomeTutorial = signal(false);
  protected readonly tutorialStep = signal(1);

  protected readonly reportFaculties = signal<Faculty[]>([]);
  protected readonly reportLocations = signal<Location[]>([]);
  protected readonly catalogLocationFaculties = signal<Faculty[]>([]);

  protected readonly searchQuery = this.homeSearch.query;
  protected readonly reports = signal<ApiReport[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    campusId: [null as number | null, Validators.required],
    facultyId: [null as number | null, Validators.required],
    locationId: [null as number | null, Validators.required],
    description: ['', Validators.required],
    imageUrl: [''],
  });

  protected readonly catalogCampusForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
  });

  protected readonly catalogFacultyForm = this.fb.nonNullable.group({
    campusId: [null as number | null, Validators.required],
    name: ['', Validators.required],
  });

  protected readonly catalogLocationForm = this.fb.nonNullable.group({
    campusId: [null as number | null, Validators.required],
    facultyId: [null as number | null, Validators.required],
    name: ['', Validators.required],
  });

  protected readonly roleSlug = this.session.currentSlug;
  protected readonly spacesView = signal(
    this.route.snapshot.data['adminContext'] === 'espacios',
  );
  protected readonly hasSpacesAccess = this.session.hasSpacesAccess;
  protected readonly isAdmin = computed(
    () => this.roleSlug() === 'administrador',
  );
  /**
   * En `/inicio/espacios` se reutiliza la vista de catálogo del
   * administrador, pero solo para cuentas con permiso de HU-26.
   */
  protected readonly dashboardView = computed<RoleSlug>(() =>
    this.spacesView() && this.hasSpacesAccess()
      ? 'administrador'
      : this.roleSlug(),
  );

  protected readonly ownReports = computed(() => {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      return [];
    }
    return this.reports().filter((item) => item.authorId === userId);
  });

  protected readonly filteredOwnReports = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const items = this.ownReports();
    if (!query) {
      return items;
    }
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.folio.toLowerCase().includes(query),
    );
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredOwnReports().length / this.pageSize)),
  );

  protected readonly pagedOwnReports = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredOwnReports().slice(start, start + this.pageSize);
  });

  protected readonly showPaginator = computed(() => this.filteredOwnReports().length > this.pageSize);

  protected readonly unclassified = computed(() =>
    this.reports().filter((item) => !item.classified),
  );

  protected readonly unassigned = computed(() =>
    this.reports().filter(
      (item) => item.classified && item.assigneeId == null && item.status !== 'cerrada',
    ),
  );

  protected readonly allReports = computed(() => this.reports());

  protected readonly awaitingValidation = computed(() =>
    this.reports().filter((item) => item.awaitingValidation),
  );

  protected readonly inProgress = computed(() =>
    this.reports().filter((item) => item.status === 'en_progreso' || item.status === 'asignada'),
  );

  protected readonly assignedToMe = computed(() =>
    this.reports().filter((item) => item.assigneeId === this.auth.currentUser()?.id),
  );

  /**
   * HU-21: alcance del panel de actividad según el rol activo.
   * Reportante solo ve la actividad de sus reportes; el técnico la de los
   * asignados a él (o propios); los roles de supervisión ven el feed global.
   */
  protected readonly activityFolios = computed<string[] | null>(() => {
    const slug = this.roleSlug();
    const userId = Number(this.auth.currentUser()?.id);

    if (slug === 'reportante') {
      return this.reports()
        .filter((item) => Number(item.authorId) === userId)
        .map((item) => item.folio);
    }

    if (slug === 'tecnico') {
      return this.reports()
        .filter(
          (item) =>
            Number(item.assigneeId) === userId || Number(item.authorId) === userId,
        )
        .map((item) => item.folio);
    }

    return null;
  });

  constructor() {
    if (this.route.snapshot.data['adminContext'] === 'espacios') {
      this.adminContext.set('espacios');
    }

    this.form.controls.facultyId.disable({ emitEvent: false });
    this.form.controls.locationId.disable({ emitEvent: false });
    this.catalogLocationForm.controls.facultyId.disable({ emitEvent: false });

    // Resets page to 1 whenever the search query changes
    effect(() => {
      this.searchQuery();
      this.page.set(1);
    });

    // Re-loads dashboard data automatically whenever the active role changes.
    // This also runs on first render, replacing the need for ngOnInit.
    effect(() => {
      const slug = this.roleSlug();
      this.loadReports();
      if (slug === 'administrador') {
        this.loadUsers();
      }
      if (
        untracked(this.spacesView) &&
        untracked(this.hasSpacesAccess)
      ) {
        this.loadCatalogData();
      }
      if (slug === 'reportante' || slug === 'administrador') {
        this.loadCampuses();
      }
      
      if (slug === 'reportante') {
        try {
          if (!localStorage.getItem('has_seen_tutorial_reportante')) {
            this.showWelcomeTutorial.set(true);
            this.tutorialStep.set(1);
          }
        } catch {}
      }
    });
  }

  protected nextTutorialStep(): void {
    this.tutorialStep.update(s => s + 1);
  }

  protected finishTutorial(): void {
    this.showWelcomeTutorial.set(false);
    try {
      localStorage.setItem('has_seen_tutorial_reportante', 'true');
    } catch {}
  }

  protected setAdminContext(context: AdminContext): void {
    this.adminContext.set(context);
    if (context === 'usuarios') {
      this.loadUsers();
    }
    if (context === 'espacios') {
      this.loadCatalogData();
    }
  }

  protected setCatalogContext(context: CatalogContext): void {
    this.catalogContext.set(context);
    this.loadCatalogData();
  }

  protected campusName(campusId: number): string {
    return this.campuses().find((item) => item.id === campusId)?.name ?? `#${campusId}`;
  }

  protected facultyName(facultyId: number): string {
    return this.faculties().find((item) => item.id === facultyId)?.name ?? `#${facultyId}`;
  }

  protected locationCampusName(location: Location): string {
    const faculty = this.faculties().find((item) => item.id === location.facultyId);
    if (!faculty) {
      return '—';
    }
    return this.campusName(faculty.campusId);
  }

  protected loadCampuses(): void {
    this.catalogApi.listCampuses().subscribe({
      next: (items) => this.campuses.set(items),
      error: () => { },
    });
  }

  protected loadCatalogData(): void {
    this.catalogLoading.set(true);
    this.catalogError.set(null);

    this.catalogApi.listCampuses().subscribe({
      next: (campusItems) => {
        this.campuses.set(campusItems);
        this.catalogApi.listFaculties().subscribe({
          next: (facultyItems) => {
            this.faculties.set(facultyItems);
            this.catalogApi.listLocations().subscribe({
              next: (locationItems) => {
                this.locations.set(locationItems);
                this.catalogLoading.set(false);
              },
              error: () => {
                this.catalogError.set('No se pudieron cargar las ubicaciones.');
                this.catalogLoading.set(false);
              },
            });
          },
          error: () => {
            this.catalogError.set('No se pudieron cargar las facultades.');
            this.catalogLoading.set(false);
          },
        });
      },
      error: () => {
        this.catalogError.set('No se pudieron cargar los campuses.');
        this.catalogLoading.set(false);
      },
    });
  }

  protected openCatalogDialog(type: CatalogContext, mode: CatalogDialogMode, item?: Campus | Faculty | Location): void {
    this.catalogDialogType.set(type);
    this.catalogDialogMode.set(mode);
    this.catalogSubmitError.set(null);
    this.catalogLocationFaculties.set([]);

    if (type === 'campus') {
      if (mode === 'create') {
        this.catalogEditingId.set(null);
        this.catalogCampusForm.reset({ code: '', name: '' });
      } else if (item && 'code' in item) {
        this.catalogEditingId.set(item.id);
        this.catalogCampusForm.reset({ code: item.code, name: item.name });
      }
    } else if (type === 'faculty') {
      if (mode === 'create') {
        this.catalogEditingId.set(null);
        this.catalogFacultyForm.reset({ campusId: null, name: '' });
      } else if (item && 'campusId' in item) {
        this.catalogEditingId.set(item.id);
        this.catalogFacultyForm.reset({ campusId: item.campusId, name: item.name });
      }
    } else if (type === 'location') {
      if (mode === 'create') {
        this.catalogEditingId.set(null);
        this.catalogLocationForm.reset({ campusId: null, facultyId: null, name: '' });
      } else if (item && 'facultyId' in item) {
        this.catalogEditingId.set(item.id);
        const faculty = this.faculties().find((f) => f.id === item.facultyId);
        this.catalogLocationFaculties.set(
          faculty ? this.faculties().filter((f) => f.campusId === faculty.campusId) : [],
        );
        this.catalogLocationForm.reset({
          campusId: faculty?.campusId ?? null,
          facultyId: item.facultyId,
          name: item.name,
        });
      }
      this.syncCatalogLocationFacultyEnabled();
    }

    this.catalogDialogOpen.set(true);
  }

  protected closeCatalogDialog(): void {
    this.catalogDialogOpen.set(false);
    this.catalogEditingId.set(null);
    this.catalogSubmitError.set(null);
    this.confirm.close();
  }

  private parseSelectId(event: Event): number | null {
    const raw = (event.target as HTMLSelectElement).value;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private toRequiredId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private catalogTypeLabel(type: CatalogContext): string {
    const labels: Record<CatalogContext, string> = {
      campus: 'campus',
      faculty: 'facultad',
      location: 'ubicación',
    };
    return labels[type];
  }

  private syncCatalogLocationFacultyEnabled(): void {
    const campusId = this.toRequiredId(this.catalogLocationForm.getRawValue().campusId);
    if (campusId) {
      this.catalogLocationForm.controls.facultyId.enable({ emitEvent: false });
    } else {
      this.catalogLocationForm.controls.facultyId.disable({ emitEvent: false });
    }
  }

  private syncReportChainEnabled(): void {
    const campusId = this.toRequiredId(this.form.getRawValue().campusId);
    const facultyId = this.toRequiredId(this.form.getRawValue().facultyId);
    if (campusId) {
      this.form.controls.facultyId.enable({ emitEvent: false });
    } else {
      this.form.controls.facultyId.disable({ emitEvent: false });
    }
    if (facultyId) {
      this.form.controls.locationId.enable({ emitEvent: false });
    } else {
      this.form.controls.locationId.disable({ emitEvent: false });
    }
  }

  protected onCatalogLocationCampusChange(event: Event): void {
    const campusId = this.parseSelectId(event);
    this.catalogLocationForm.patchValue({ campusId, facultyId: null });
    this.syncCatalogLocationFacultyEnabled();
    if (campusId) {
      this.catalogApi.listFaculties(campusId).subscribe({
        next: (items) => this.catalogLocationFaculties.set(items),
      });
    } else {
      this.catalogLocationFaculties.set([]);
    }
  }

  protected onCatalogFacultyCampusChange(event: Event): void {
    const campusId = this.parseSelectId(event);
    this.catalogFacultyForm.patchValue({ campusId });
  }

  protected onCatalogLocationFacultyChange(event: Event): void {
    const facultyId = this.parseSelectId(event);
    this.catalogLocationForm.patchValue({ facultyId });
  }

  private catalogFormIsValid(): boolean {
    const type = this.catalogDialogType();
    if (type === 'campus') {
      this.catalogCampusForm.markAllAsTouched();
      return this.catalogCampusForm.valid;
    }
    if (type === 'faculty') {
      this.catalogFacultyForm.markAllAsTouched();
      const campusId = this.toRequiredId(this.catalogFacultyForm.getRawValue().campusId);
      return this.catalogFacultyForm.valid && campusId != null;
    }
    this.catalogLocationForm.markAllAsTouched();
    const value = this.catalogLocationForm.getRawValue();
    return (
      this.catalogLocationForm.valid &&
      this.toRequiredId(value.campusId) != null &&
      this.toRequiredId(value.facultyId) != null
    );
  }

  protected submitCatalogDialog(): void {
    this.catalogSubmitError.set(null);
    if (!this.catalogFormIsValid()) {
      this.catalogSubmitError.set('Completa todos los campos antes de guardar.');
      return;
    }
    this.confirm.ask({
      message: this.catalogSaveConfirmMessage(),
      confirmLabel: 'Confirmar',
      onConfirm: () => this.performCatalogSave(),
    });
  }

  private catalogSaveConfirmMessage(): string {
    const mode = this.catalogDialogMode();
    const type = this.catalogTypeLabel(this.catalogDialogType());
    if (mode === 'create') {
      const article = type === 'campus' ? 'este' : 'esta';
      return `¿Crear ${article} ${type}?`;
    }
    return '¿Guardar los cambios?';
  }

  private performCatalogSave(): void {
    if (this.catalogSubmitting()) {
      return;
    }
    const type = this.catalogDialogType();
    const mode = this.catalogDialogMode();
    this.catalogSubmitting.set(true);
    this.catalogSubmitError.set(null);
    this.confirm.setBusy(true);
    this.confirm.setError(null);

    if (type === 'campus') {
      const value = this.catalogCampusForm.getRawValue();
      const request =
        mode === 'create'
          ? this.catalogApi.createCampus(value)
          : this.catalogApi.updateCampus(this.catalogEditingId()!, value);
      request.subscribe({
        next: () => {
          this.catalogSubmitting.set(false);
          this.confirm.close();
          this.closeCatalogDialog();
          this.loadCatalogData();
          this.loadCampuses();
          this.toast.show(mode === 'create' ? 'Campus creado' : 'Campus actualizado');
        },
        error: (err) => {
          this.confirm.setError(err?.error?.detail ?? 'No se pudo guardar el campus.');
          this.catalogSubmitting.set(false);
          this.confirm.setBusy(false);
        },
      });
      return;
    }

    if (type === 'faculty') {
      const value = this.catalogFacultyForm.getRawValue();
      const campusId = this.toRequiredId(value.campusId);
      if (campusId == null) {
        this.confirm.setError('Selecciona un campus.');
        this.catalogSubmitting.set(false);
        this.confirm.setBusy(false);
        return;
      }
      const payload = { campusId, name: value.name };
      const request =
        mode === 'create'
          ? this.catalogApi.createFaculty(payload)
          : this.catalogApi.updateFaculty(this.catalogEditingId()!, payload);
      request.subscribe({
        next: () => {
          this.catalogSubmitting.set(false);
          this.confirm.close();
          this.closeCatalogDialog();
          this.loadCatalogData();
          this.toast.show(mode === 'create' ? 'Facultad creada' : 'Facultad actualizada');
        },
        error: (err) => {
          this.confirm.setError(err?.error?.detail ?? 'No se pudo guardar la facultad.');
          this.catalogSubmitting.set(false);
          this.confirm.setBusy(false);
        },
      });
      return;
    }

    const value = this.catalogLocationForm.getRawValue();
    const facultyId = this.toRequiredId(value.facultyId);
    if (facultyId == null) {
      this.confirm.setError('Selecciona una facultad.');
      this.catalogSubmitting.set(false);
      this.confirm.setBusy(false);
      return;
    }
    const payload = { facultyId, name: value.name };
    const request =
      mode === 'create'
        ? this.catalogApi.createLocation(payload)
        : this.catalogApi.updateLocation(this.catalogEditingId()!, payload);
    request.subscribe({
      next: () => {
        this.catalogSubmitting.set(false);
        this.confirm.close();
        this.closeCatalogDialog();
        this.loadCatalogData();
        this.toast.show(mode === 'create' ? 'Ubicación creada' : 'Ubicación actualizada');
      },
      error: (err) => {
        this.confirm.setError(err?.error?.detail ?? 'No se pudo guardar la ubicación.');
        this.catalogSubmitting.set(false);
        this.confirm.setBusy(false);
      },
    });
  }

  protected requestCatalogDelete(type: CatalogContext, id: number, label: string): void {
    this.catalogDeleteType.set(type);
    this.catalogDeleteId.set(id);
    this.catalogDeleteLabel.set(label);
    this.catalogSubmitError.set(null);
    this.confirm.ask({
      message: `¿Eliminar ${label}?`,
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: () => this.performCatalogDelete(),
    });
  }

  private performCatalogDelete(): void {
    const type = this.catalogDeleteType();
    const id = this.catalogDeleteId();
    if (id == null) {
      return;
    }
    this.catalogSubmitting.set(true);
    this.catalogSubmitError.set(null);
    this.confirm.setBusy(true);
    this.confirm.setError(null);

    const request =
      type === 'campus'
        ? this.catalogApi.deleteCampus(id)
        : type === 'faculty'
          ? this.catalogApi.deleteFaculty(id)
          : this.catalogApi.deleteLocation(id);

    request.subscribe({
      next: () => {
        this.catalogSubmitting.set(false);
        this.confirm.close();
        this.catalogDeleteId.set(null);
        this.catalogDeleteLabel.set('');
        this.loadCatalogData();
        this.loadCampuses();
        const labels: Record<CatalogContext, string> = {
          campus: 'Campus eliminado',
          faculty: 'Facultad eliminada',
          location: 'Ubicación eliminada',
        };
        this.toast.show(labels[type]);
      },
      error: (err) => {
        this.confirm.setError(err?.error?.detail ?? 'No se pudo eliminar el registro.');
        this.catalogSubmitting.set(false);
        this.confirm.setBusy(false);
      },
    });
  }

  protected catalogDialogTitle(): string {
    const mode = this.catalogDialogMode();
    const type = this.catalogDialogType();
    const labels: Record<CatalogContext, string> = {
      campus: 'campus',
      faculty: 'facultad',
      location: 'ubicación',
    };
    return mode === 'create' ? `Nuevo ${labels[type]}` : `Editar ${labels[type]}`;
  }

  protected onReportCampusChange(event: Event): void {
    const campusId = this.parseSelectId(event);
    this.form.patchValue({ campusId, facultyId: null, locationId: null });
    this.reportFaculties.set([]);
    this.reportLocations.set([]);
    this.syncReportChainEnabled();
    if (campusId) {
      this.catalogApi.listFaculties(campusId).subscribe({
        next: (items) => this.reportFaculties.set(items),
      });
    }
  }

  protected onReportFacultyChange(event: Event): void {
    const facultyId = this.parseSelectId(event);
    this.form.patchValue({ facultyId, locationId: null });
    this.reportLocations.set([]);
    this.syncReportChainEnabled();
    if (facultyId) {
      this.catalogApi.listLocations(facultyId).subscribe({
        next: (items) => this.reportLocations.set(items),
      });
    }
  }

  private loadReportHierarchy(
    campusId: number | null,
    facultyId: number | null,
    locationId: number | null,
  ): void {
    this.reportFaculties.set([]);
    this.reportLocations.set([]);
    this.form.patchValue({ campusId, facultyId, locationId });
    this.syncReportChainEnabled();
    if (!campusId) {
      return;
    }
    this.catalogApi.listFaculties(campusId).subscribe({
      next: (faculties) => {
        this.reportFaculties.set(faculties);
        if (!facultyId) {
          return;
        }
        this.catalogApi.listLocations(facultyId).subscribe({
          next: (locations) => this.reportLocations.set(locations),
        });
      },
    });
  }

  protected loadUsers(): void {
    this.usersLoading.set(true);
    this.usersError.set(null);
    this.usersApi.list().subscribe({
      next: (items) => {
        this.users.set(items);
        const drafts: Record<number, string[]> = {};
        for (const user of items) {
          drafts[user.id] = [...user.roles];
        }
        this.userRoleDrafts.set(drafts);
        this.usersLoading.set(false);
      },
      error: () => {
        this.usersError.set('No se pudieron cargar los usuarios.');
        this.usersLoading.set(false);
      },
    });
  }

  protected backendRoleValue(slug: RoleSlug): string {
    return roleSlugToBackend(slug);
  }

  protected userHasDraftRole(userId: number, slug: RoleSlug): boolean {
    const backendRole = this.backendRoleValue(slug);
    return (this.userRoleDrafts()[userId] ?? []).includes(backendRole);
  }

  protected toggleUserRole(userId: number, slug: RoleSlug): void {
    const backendRole = this.backendRoleValue(slug);
    const current = [...(this.userRoleDrafts()[userId] ?? [])];
    const index = current.indexOf(backendRole);

    if (index >= 0) {
      if (current.length <= 1) {
        this.userSaveError.set('El usuario debe conservar al menos un rol.');
        return;
      }
      current.splice(index, 1);
    } else {
      current.push(backendRole);
    }

    this.userSaveError.set(null);
    this.userRoleDrafts.update((drafts) => ({
      ...drafts,
      [userId]: current,
    }));
  }

  protected userRolesDirty(user: ApiUser): boolean {
    const draft = this.userRoleDrafts()[user.id] ?? [];
    if (draft.length !== user.roles.length) {
      return true;
    }
    const saved = new Set(user.roles);
    return draft.some((role) => !saved.has(role));
  }

  protected saveUserRoles(user: ApiUser): void {
    const roles = this.userRoleDrafts()[user.id] ?? [];
    if (roles.length === 0) {
      this.userSaveError.set('El usuario debe conservar al menos un rol.');
      return;
    }

    this.confirm.ask({
      message: `¿Estás seguro que deseas actualizar los roles de ${user.name}?`,
      confirmLabel: 'Confirmar',
      onConfirm: () => this.performSaveUserRoles(user),
    });
  }

  private performSaveUserRoles(user: ApiUser): void {
    const roles = this.userRoleDrafts()[user.id] ?? [];
    if (roles.length === 0) {
      this.confirm.setError('El usuario debe conservar al menos un rol.');
      return;
    }

    this.savingUserId.set(user.id);
    this.userSaveError.set(null);
    this.confirm.setBusy(true);
    this.confirm.setError(null);
    this.usersApi.updateRoles(user.id, roles).subscribe({
      next: (updated) => {
        this.users.update((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.userRoleDrafts.update((drafts) => ({
          ...drafts,
          [updated.id]: [...updated.roles],
        }));
        if (updated.id === this.auth.currentUser()?.id) {
          this.auth.refreshProfile().subscribe();
        }
        this.savingUserId.set(null);
        this.confirm.close();
        this.toast.show('Roles actualizados');
      },
      error: (err) => {
        this.confirm.setError(
          err?.error?.detail ?? 'No se pudieron actualizar los roles del usuario.',
        );
        this.savingUserId.set(null);
        this.confirm.setBusy(false);
      },
    });
  }

  protected loadReports(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.list().subscribe({
      next: (items) => {
        this.reports.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('No se pudieron cargar los reportes.');
        this.loading.set(false);
      },
    });
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.homeSearch.setQuery(value);
  }

  protected goToPage(nextPage: number): void {
    const clamped = Math.min(Math.max(1, nextPage), this.totalPages());
    this.page.set(clamped);
  }

  protected openDialog(): void {
    this.dialogMode.set('create');
    this.editingFolio.set(null);
    this.form.reset({
      title: '',
      campusId: null,
      facultyId: null,
      locationId: null,
      description: '',
      imageUrl: '',
    });
    this.reportFaculties.set([]);
    this.reportLocations.set([]);
    this.syncReportChainEnabled();
    this.loadCampuses();
    this.resetImageState();
    this.submitError.set(null);
    this.confirm.close();
    this.deleteTarget.set(null);
    this.dialogOpen.set(true);
  }

  protected openEditDialog(report: ApiReport): void {
    if (report.status !== 'reportada') {
      return;
    }
    this.dialogMode.set('edit');
    this.editingFolio.set(report.folio);
    this.form.reset({
      title: report.title,
      campusId: report.campusId,
      facultyId: report.facultyId,
      locationId: report.locationId,
      description: report.description,
      imageUrl: report.imageUrl ?? '',
    });
    this.loadCampuses();
    this.loadReportHierarchy(report.campusId, report.facultyId, report.locationId);
    this.resetImageState();
    if (report.imageUrl) {
      this.imageSource.set('url');
      this.imagePreviewUrl.set(report.imageUrl);
    }
    this.submitError.set(null);
    this.confirm.close();
    this.deleteTarget.set(null);
    this.dialogOpen.set(true);
  }

  protected requestDelete(report: ApiReport): void {
    if (report.status !== 'reportada') {
      return;
    }
    this.deleteTarget.set(report);
    this.confirm.ask({
      message: '¿Estás seguro que deseas eliminar este reporte?',
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: () => this.performDelete(),
    });
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
    this.dialogMode.set('create');
    this.editingFolio.set(null);
    this.resetImageState();
  }

  protected setImageSource(source: ImageSource): void {
    this.imageSource.set(source);
    this.imageError.set(null);
    if (source === 'url') {
      this.selectedImageFile.set(null);
      this.imagePreviewUrl.set(this.form.controls.imageUrl.value || null);
    } else if (source === 'none') {
      this.resetImageState();
    } else {
      this.form.controls.imageUrl.setValue('');
      this.selectedImageFile.set(null);
      this.imagePreviewUrl.set(null);
    }
  }

  protected onImageUrlInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.form.controls.imageUrl.setValue(value);
    this.imagePreviewUrl.set(value || null);
    this.imageSource.set(value ? 'url' : 'none');
    this.selectedImageFile.set(null);
    this.imageError.set(null);
  }

  protected onImageFile(event: Event, source: 'file' | 'camera'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.imageError.set('Selecciona un archivo de imagen válido.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.imageError.set('La imagen no puede superar 5 MB.');
      return;
    }
    this.imageSource.set(source);
    this.selectedImageFile.set(file);
    this.form.controls.imageUrl.setValue('');
    this.imageError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreviewUrl.set(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  protected clearImage(): void {
    this.resetImageState();
  }

  protected submitReport(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    const campusId = this.toRequiredId(value.campusId);
    const facultyId = this.toRequiredId(value.facultyId);
    const locationId = this.toRequiredId(value.locationId);
    if (this.form.invalid || campusId == null || facultyId == null || locationId == null) {
      this.submitError.set('Completa título, campus, facultad, ubicación y descripción.');
      return;
    }
    if (this.submitting()) {
      return;
    }

    if (this.dialogMode() === 'edit') {
      this.confirm.ask({
        message: '¿Estás seguro que deseas realizar la modificación?',
        onConfirm: () => {
          this.submitting.set(true);
          this.confirm.setBusy(true);
          this.confirm.setError(null);
          this.submitError.set(null);
          this.imageError.set(null);
          this.resolveImageUrl((imageUrl) => this.performUpdate(imageUrl));
        },
      });
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.imageError.set(null);
    this.resolveImageUrl((imageUrl) => this.performCreate(imageUrl));
  }

  protected canMutateReport(report: ApiReport): boolean {
    return report.status === 'reportada';
  }

  private resolveImageUrl(onResolved: (imageUrl: string | null) => void): void {
    const value = this.form.getRawValue();
    const file = this.selectedImageFile();
    if (file && (this.imageSource() === 'file' || this.imageSource() === 'camera')) {
      this.api.uploadImage(file).subscribe({
        next: (response) => onResolved(response.imageUrl),
        error: (err) => {
          this.imageError.set(err?.error?.detail ?? 'No se pudo subir la imagen.');
          this.submitting.set(false);
          this.confirm.setBusy(false);
        },
      });
      return;
    }
    onResolved(value.imageUrl.trim() || null);
  }

  private buildReportPayload(imageUrl: string | null): CreateApiReportInput | null {
    const value = this.form.getRawValue();
    const campusId = this.toRequiredId(value.campusId);
    const facultyId = this.toRequiredId(value.facultyId);
    const locationId = this.toRequiredId(value.locationId);
    if (campusId == null || facultyId == null || locationId == null) {
      this.submitError.set('Selecciona campus, facultad y ubicación.');
      return null;
    }
    return {
      title: value.title,
      description: value.description,
      campusId,
      facultyId,
      locationId,
      imageUrl,
    };
  }

  private performCreate(imageUrl: string | null): void {
    const payload = this.buildReportPayload(imageUrl);
    if (!payload) {
      this.submitting.set(false);
      return;
    }
    this.api.create(payload).subscribe({
      next: (report) => {
        this.reports.update((items) => [report, ...items]);
        this.dialogOpen.set(false);
        this.resetImageState();
        this.createdTitle.set(report.title);
        this.createdFolio.set(report.folio);
        this.submitting.set(false);
      },
      error: (err) => {
        this.submitError.set(
          err?.error?.detail ?? 'No se pudo crear el reporte. Intenta de nuevo.',
        );
        this.submitting.set(false);
      },
    });
  }

  private performUpdate(imageUrl: string | null): void {
    const folio = this.editingFolio();
    if (!folio) {
      this.submitting.set(false);
      this.confirm.setBusy(false);
      return;
    }
    const payload = this.buildReportPayload(imageUrl);
    if (!payload) {
      this.submitting.set(false);
      this.confirm.setBusy(false);
      return;
    }
    this.api.update(folio, payload).subscribe({
      next: (report) => {
        this.reports.update((items) =>
          items.map((item) => (item.folio === folio ? report : item)),
        );
        this.confirm.close();
        this.dialogOpen.set(false);
        this.dialogMode.set('create');
        this.editingFolio.set(null);
        this.resetImageState();
        this.submitting.set(false);
      },
      error: (err) => {
        this.confirm.setError(
          err?.error?.detail ?? 'No se pudo actualizar el reporte. Intenta de nuevo.',
        );
        this.submitting.set(false);
        this.confirm.setBusy(false);
      },
    });
  }

  private performDelete(): void {
    const report = this.deleteTarget();
    if (!report) {
      return;
    }
    this.submitting.set(true);
    this.confirm.setBusy(true);
    this.confirm.setError(null);
    this.api.delete(report.folio).subscribe({
      next: () => {
        this.reports.update((items) => items.filter((item) => item.folio !== report.folio));
        this.confirm.close();
        this.deleteTarget.set(null);
        this.submitting.set(false);
      },
      error: (err) => {
        this.confirm.setError(
          err?.error?.detail ?? 'No se pudo eliminar el reporte. Intenta de nuevo.',
        );
        this.submitting.set(false);
        this.confirm.setBusy(false);
      },
    });
  }

  protected closeCreated(): void {
    this.createdTitle.set(null);
    this.createdFolio.set(null);
  }

  protected statusLabel(status: ApiReport['status']): string {
    return labelForStatus(status);
  }

  private resetImageState(): void {
    this.imageSource.set('none');
    this.imagePreviewUrl.set(null);
    this.selectedImageFile.set(null);
    this.imageError.set(null);
    this.form.controls.imageUrl.setValue('');
  }


}
