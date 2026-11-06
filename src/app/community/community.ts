import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ReportCard } from '../report-card/report-card';
import { ApiReport, ReportsApiService } from '../data/reports-api.service';
import { HomeSearchService } from '../session/home-search.service';
import { Spinner } from '../ui/spinner/spinner';
import { CatalogApiService } from '../data/catalog-api.service';

@Component({
  selector: 'app-community',
  imports: [ReportCard, Spinner],
  templateUrl: './community.html',
  styleUrl: './community.css',
})
export class Community implements OnInit {
  private readonly api = inject(ReportsApiService);
  private readonly homeSearch = inject(HomeSearchService);

  protected readonly pageSize = 10;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly reports = signal<ApiReport[]>([]);
  protected readonly page = signal(1);
  protected readonly searchQuery = this.homeSearch.query;

  protected readonly communityReports = computed(() => this.reports());

  /*=========================================================================== */
  private readonly catalogApi = inject(CatalogApiService);

  // Señales para los filtros seleccionados
  protected readonly selectedCampusId = signal<number | null>(null);
  protected readonly selectedFacultyId = signal<number | null>(null);
  protected readonly selectedLocationId = signal<number | null>(null);
  protected readonly selectedStatus = signal<string>('');

  // Señales para las opciones de los catálogos en cascada
  protected readonly campuses = signal<any[]>([]);
  protected readonly faculties = signal<any[]>([]);
  protected readonly locations = signal<any[]>([]);
  /*============================================================================= */

  protected readonly filteredCommunityReports = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const items = this.communityReports();
    if (!query) {
      return items;
    }
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.folio.toLowerCase().includes(query) ||
        item.author.name.toLowerCase().includes(query),
    );
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredCommunityReports().length / this.pageSize)),
  );

  protected readonly pagedCommunityReports = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredCommunityReports().slice(start, start + this.pageSize);
  });

  protected readonly showPaginator = computed(
    () => this.filteredCommunityReports().length > this.pageSize,
  );

  constructor() {
    effect(() => {
      this.searchQuery();
      this.page.set(1);
    });
  }

  ngOnInit(): void {
    this.loadReports();
    this.loadCampuses();
  }

  /*======================================================================================== */
  protected loadReports(): void {
    this.loading.set(true);
    this.loadError.set(null);
    
    const filters = {
      search: this.searchQuery() || undefined,
      status: this.selectedStatus() || undefined,
      campusId: this.selectedCampusId() ?? undefined,
      facultyId: this.selectedFacultyId() ?? undefined,
      locationId: this.selectedLocationId() ?? undefined,
    };

    this.api.list(filters).subscribe({
      next: (items) => {
        this.reports.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('No se pudieron cargar los reportes de la comunidad.');
        this.loading.set(false);
      },
    });
  }
  /*=================================================================================== */

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.homeSearch.setQuery(value);
  }

  protected goToPage(nextPage: number): void {
    const clamped = Math.min(Math.max(1, nextPage), this.totalPages());
    this.page.set(clamped);
  }

  //=================================================================================================
  // Cargar campus al iniciar
  protected loadCampuses(): void {
    this.catalogApi.listCampuses().subscribe({
      next: (data: any) => this.campuses.set(data ?? []),
    });
  }

  // Cuando cambia el Campus, cargamos sus facultades y limpiamos las selecciones hijas
  protected onCampusChange(campusId: number | null): void {
    this.selectedCampusId.set(campusId);
    this.selectedFacultyId.set(null);
    this.selectedLocationId.set(null);
    this.faculties.set([]);
    this.locations.set([]);

    if (campusId) {
      this.catalogApi.listFaculties(campusId).subscribe({
        next: (data: any) => this.faculties.set(data ?? []),
      });
    }
    this.loadReports();
  }

  // Cuando cambia la Facultad, cargamos sus ubicaciones y limpiamos la ubicación seleccionada
  protected onFacultyChange(facultyId: number | null): void {
    this.selectedFacultyId.set(facultyId);
    this.selectedLocationId.set(null);
    this.locations.set([]);

    if (facultyId) {
      this.catalogApi.listLocations(facultyId).subscribe({
        next: (data: any) => this.locations.set(data ?? []),
      });
    }
    this.loadReports();
  }

  protected onLocationChange(locationId: number | null): void {
    this.selectedLocationId.set(locationId);
    this.loadReports();
  }

  protected onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.loadReports();
  }
}
