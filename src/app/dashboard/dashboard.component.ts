import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: '../workload/workload.css'
})
export class DashboardComponent implements OnInit {
  kpis: any = {
    total_activas: 18,
    en_progreso: 7,
    bloqueadas: 2,
    vencidas: 3,
    resueltas: 24
  };
  areas: any[] = [
    { area_id: 1, area_nombre: 'Mantenimiento TI', total_incidencias: 8, bloqueadas: 2, vencidas: 1 },
    { area_id: 2, area_nombre: 'Infraestructura y Obras', total_incidencias: 6, bloqueadas: 0, vencidas: 2 },
    { area_id: 3, area_nombre: 'Adquisiciones y Almacén', total_incidencias: 4, bloqueadas: 0, vencidas: 0 }
  ];
  alertasVencidas: any[] = [
    {
      id: 42,
      folio: 'INC-2026-0042',
      titulo: 'Proyector sin imagen en aula 204',
      estado: 'bloqueada',
      prioridad: 'alta',
      area_nombre: 'Mantenimiento TI',
      tecnico_nombre: 'Carlos Núñez',
      horas_vencida: 31
    },
    {
      id: 35,
      folio: 'INC-2026-0035',
      titulo: 'Fuga de agua en sanitarios edificio FCC-2',
      estado: 'en_progreso',
      prioridad: 'alta',
      area_nombre: 'Infraestructura y Obras',
      tecnico_nombre: 'Ana Torres',
      horas_vencida: 18
    },
    {
      id: 48,
      folio: 'INC-2026-0048',
      titulo: 'Falla en centro de carga laboratorio 3',
      estado: 'en_progreso',
      prioridad: 'alta',
      area_nombre: 'Infraestructura y Obras',
      tecnico_nombre: 'Sin asignar',
      horas_vencida: 8
    }
  ];
  cargando: boolean = false;

  constructor(
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.cargando = true;
    this.cdr.markForCheck();

    this.dashboardService.obtenerDatos().subscribe({
      next: (data) => {
        if (data) {
          this.kpis = data.kpis || this.kpis;
          this.areas = data.areas || this.areas;
          this.alertasVencidas = data.alertas_vencidas || this.alertasVencidas;
        }
        this.cargando = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargando = false;
        this.cdr.markForCheck();
      }
    });
  }
}
