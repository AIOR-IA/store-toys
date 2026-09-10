import { NgModule } from '@angular/core';
import { RouterLink, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SidebarModule } from 'primeng/sidebar';
import { BadgeModule } from 'primeng/badge';
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputSwitchModule } from 'primeng/inputswitch';
import { RippleModule } from 'primeng/ripple';
import { AppTopbarComponent } from './components/topbar/topbar.component';
import { AppSidebarComponent } from './components/sidebar/sidebar.component';
import { AppFooterComponent } from './components/footer/footer.component';
import { AppMenuComponent } from './components/menu/menu.component';
import { AppMenuItemComponent } from './components/menu/menu-item/menu-item.component';
import { AppLayoutComponent } from './layout.component';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { MegaMenuModule } from 'primeng/megamenu';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { TranslateModule } from '@ngx-translate/core';
import { SanitizeHtmlPipe, TruncateTextPipe } from '@shared/pipes';
import { UserMenuOverlayPanelComponent } from './components/topbar/user-menu-overlay-panel/user-menu-overlay-panel.component';
import { ImageModule } from 'primeng/image';

@NgModule({
    declarations: [
        UserMenuOverlayPanelComponent,
        AppTopbarComponent,
        AppSidebarComponent,
        AppFooterComponent,
        AppMenuItemComponent,
        AppMenuComponent,
        AppLayoutComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        InputTextModule,
        SidebarModule,
        BadgeModule,
        RadioButtonModule,
        InputSwitchModule,
        RippleModule,
        RouterModule,
        OverlayPanelModule,
        MegaMenuModule,
        ToastModule,
        ButtonModule,
        DropdownModule,
        TranslateModule,
        TruncateTextPipe,
        RouterLink,
        SanitizeHtmlPipe,
        ImageModule,
    ],
    exports: [AppTopbarComponent],
})
export class AppLayoutModule {}
