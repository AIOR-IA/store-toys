import { Component, inject, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SessionService } from '@core/services';

type CardType = 'mision' | 'vision' | 'valores' | 'objetivos' | 'que-es-abt' | null;

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './admin-dashboard.component.html',
    styleUrl: './admin-dashboard.component.scss',
    encapsulation: ViewEncapsulation.None
})
export class AdminDashboardComponent {
    sessionService = inject(SessionService);
    router = inject(Router);
    
    activeCard: CardType = null;

    constructor() {
        this.checkSessionDashboard();
    }
    
    checkSessionDashboard() {
        if (this.sessionService.isAgentOfficer()) {
            this.router.navigate(['/']);
        }
    }
    
    toggleCard(cardType: CardType) {
        if (this.activeCard === cardType) {
            this.activeCard = null;
        } else {
            this.activeCard = cardType;
        }
    }
}
