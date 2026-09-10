import { Component, inject, OnInit } from '@angular/core';
import { WebMapServiceStateService } from '../../../../services';
import { Pagination } from '@core/types';

@Component({
  selector: 'app-web-map-service-cards',
  templateUrl: './web-map-service-cards.component.html',
  styleUrl: './web-map-service-cards.component.scss'
})
export class WebMapServiceCardsComponent implements OnInit {
  state = inject(WebMapServiceStateService);

  ngOnInit(): void {
    this.state.findPage({}).then();
  }

  async onPageChange(event: any) {
    const pagination: Pagination = this.state.parsePagination(event);
    await this.state.findPage(pagination);
  }

  getWmsImageUrl(baseUrl: string, layer: string): string {
    const bbox = '-69.644935,-22.898048,-57.454433,-9.6696329';
    const width = 200;
    const height = 200;
    const srs = 'EPSG:4326';
    return `${baseUrl}?service=WMS&version=1.1.1&request=GetMap&layers=${layer}&bbox=${bbox}&width=${width}&height=${height}&srs=${srs}&format=image/png`;
  }

}
