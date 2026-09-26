import { CurrencyPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SettingsService } from '@core/services';
import { ReportPdfData, ReportsPdfService } from './reports-pdf.service';

/** Objeto cuyo valor para cualquier campo es 0 (agregados vacíos). */
const zeros = (): unknown =>
    new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? 0 : undefined) });

describe('ReportsPdfService — top productos', () => {
    it('el PDF muestra el nombre formateado; el dato del reporte no cambia', async () => {
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                CurrencyPipe,
                {
                    provide: SettingsService,
                    useValue: {
                        getSettings: () =>
                            of({ storeName: 'Mi Pimpollito', timezone: 'America/La_Paz' }),
                    },
                },
            ],
        });
        const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as {
            default: { createPdf: (doc: unknown) => unknown };
        };
        let doc: unknown;
        spyOn(pdfMakeMod.default, 'createPdf').and.callFake(((d: unknown) => {
            doc = d;
            return { print: () => undefined };
        }) as never);

        const topProducts = [
            { code: 'MP000001', name: 'Juguete transformer', qty: 2, totalCents: 9000 },
        ];
        const data = {
            fromKey: '2026-09-01',
            toKey: '2026-09-30',
            rangeTotals: zeros(),
            cashReceivedCents: 0,
            qrReceivedCents: 0,
            moneyReceivedCents: 0,
            integrity: null,
            integrityMismatch: false,
            giftCardInventory: zeros(),
            giftCardDenominations: [],
            liabilityCents: 0,
            issuesCountInRange: 0,
            redemptionsCountInRange: 0,
            topProducts,
            sellerScope: null,
        } as unknown as ReportPdfData;

        await TestBed.inject(ReportsPdfService).export(data);

        const text = JSON.stringify(doc);
        expect(text).toContain('JUGUETE TRANSFORMER');
        expect(text).not.toContain('Juguete transformer');
        expect(topProducts[0].name).toBe('Juguete transformer');
    });
});
