# XBRL Showcase (EDGAR iXBRL Income Statement)

This script downloads an EDGAR filing, finds the inline XBRL income statement table, parses numeric rows, and prints them to the console.

## Requirements
- Node.js 18+ (uses built-in `fetch`)

## Install
```bash
cd xbrl-showcase
npm install
```

## Run
```bash
read10k/xbrl-showcase » npm is -- --symbol AAPL

Selected filing: AAPL Apple Inc.
Form 10-Q filed 2026-01-30 accession 0000320193-26-000006
Income Statement (from https://www.sec.gov/Archives/edgar/data/320193/000032019326000006/aapl-20251227.htm)
Label   2025-09-28..2025-12-27  2024-09-29..2024-12-28
Products        113,743,000,000 97,960,000,000
Services        30,013,000,000  26,340,000,000
Total net sales 143,756,000,000 124,300,000,000
Products        67,478,000,000  59,447,000,000
Services        7,047,000,000   6,578,000,000
Total cost of sales     74,525,000,000  66,025,000,000
Gross margin    69,231,000,000  58,275,000,000
Research and development        10,887,000,000  8,268,000,000
Selling, general and administrative     7,492,000,000   7,175,000,000
Total operating expenses        18,379,000,000  15,443,000,000
Operating income        50,852,000,000  42,832,000,000
Other income/(expense), net     150,000,000     -248,000,000
Income before provision for income taxes        51,002,000,000  42,584,000,000
Provision for income taxes      8,905,000,000   6,254,000,000
Net income      42,097,000,000  36,330,000,000
Basic   2.85    2.41
Diluted 2.84    2.4
Basic   14,748,158,000  15,081,724,000
Diluted 14,810,356,000  15,150,865,000

```

## Run TOC
```bash
npm run toc -- --symbol AAPL
> xbrl-showcase@0.1.0 toc
> node src/edgar-ixbrl-toc.js --symbol AAPL

Selected filing: AAPL Apple Inc.
Form 10-Q filed 2026-01-30 accession 0000320193-26-000006
iXBRL Table of Contents (from https://www.sec.gov/Archives/edgar/data/320193/000032019326000006/aapl-20251227.htm)
- Common Stock, $0.00001 par value per share (tag: dei:Security12bTitle)
- 1.625% Notes due 2026 (tag: dei:Security12bTitle)
- 2.000% Notes due 2027 (tag: dei:Security12bTitle)
- 1.375% Notes due 2029 (tag: dei:Security12bTitle)
- 3.050% Notes due 2029 (tag: dei:Security12bTitle)
- 0.500% Notes due 2031 (tag: dei:Security12bTitle)
- 3.600% Notes due 2042 (tag: dei:Security12bTitle)
- Summary of Significant Accounting Policies (tag: us-gaap:BasisOfPresentationAndSignificantAccountingPoliciesTextBlock)
- Basis of Presentation and PreparationThe condensed consolidated financial statements include the accounts of Apple In... (tag: us-gaap:BasisOfAccountingPolicyPolicyTextBlock)
- Revenue (tag: us-gaap:RevenueFromContractWithCustomerTextBlock)
- The following table shows disaggregated net sales, as well as the portion of total net sales that was previously defe... (tag: aapl:DisaggregatedNetSalesAndPortionOfNetSalesThatWasPreviouslyDeferredTableTextBlock)
- Earnings Per Share (tag: us-gaap:EarningsPerShareTextBlock)
- The following table shows the computation of basic and diluted earnings per share for the three months ended December... (tag: us-gaap:ScheduleOfEarningsPerShareBasicAndDilutedTableTextBlock)
- Financial Instruments (tag: us-gaap:FinancialInstrumentsDisclosureTextBlock)
- The following tables show the Company’s cash, cash equivalents and marketable securities by significant investment ca... (tag: us-gaap:ScheduleOfCashCashEquivalentsAndShortTermInvestmentsTableTextBlock)
- The valuation techniques used to measure the fair values of the Company’s Level 2 financial instruments, which genera... (tag: us-gaap:FairValueMeasurementPolicyPolicyTextBlock)
- The notional amounts of the Company’s outstanding derivative instruments as of December 27, 2025 and September 27, 20... (tag: us-gaap:ScheduleOfNotionalAmountsOfOutstandingDerivativePositionsTableTextBlock)
- Condensed Consolidated Financial Statement Details (tag: us-gaap:AdditionalFinancialInformationDisclosureTextBlock)
- Property, Plant and Equipment, NetDecember 27,2025September 27,2025Gross property, plant and equipment$127,320 $125,8... (tag: us-gaap:PropertyPlantAndEquipmentTextBlock)
- Debt (tag: us-gaap:DebtDisclosureTextBlock)
- The following table provides a summary of cash flows associated with commercial paper for the three months ended Dece... (tag: aapl:CommercialPaperCashFlowSummaryTableTextBlock)
- Shareholders’ Equity (tag: us-gaap:StockholdersEquityNoteDisclosureTextBlock)
- Share-Based Compensation (tag: us-gaap:DisclosureOfCompensationRelatedCostsShareBasedPaymentsTextBlock)
- A summary of the Company’s restricted stock unit (“RSU”) activity and related information for the three months ended ... (tag: us-gaap:ScheduleOfNonvestedRestrictedStockUnitsActivityTableTextBlock)
- The following table shows share-based compensation expense and the related income tax benefit included in the Condens... (tag: us-gaap:ScheduleOfCompensationCostForShareBasedPaymentArrangementsAllocationOfShareBasedCompensationCostsByPlanTableTextBlock)
- Commitments and Contingencies (tag: us-gaap:CommitmentsAndContingenciesDisclosureTextBlock)
- Future payments under unconditional purchase obligations with a remaining term in excess of one year as of December 2... (tag: us-gaap:UnrecordedUnconditionalPurchaseObligationsDisclosureTextBlock)
- Segment Information (tag: us-gaap:SegmentReportingDisclosureTextBlock)
- The following table shows information by reportable segment for the three months ended December 27, 2025 and December... (tag: us-gaap:ScheduleOfSegmentReportingInformationBySegmentTextBlock)
- On November 21, 2025, Kevan Parekh, the Company’s Senior Vice President and Chief Financial Officer, entered into a t... (tag: ecd:MtrlTermsOfTrdArrTextBlock)
- Senior Vice President and Chief Financial Officer (tag: ecd:TrdArrIndTitle)
- On November 24, 2025, Deirdre O’Brien, the Company’s Senior Vice President, Retail + People, terminated a trading pla... (tag: ecd:MtrlTermsOfTrdArrTextBlock)
- Company’s Senior Vice President, Retail + People (tag: ecd:TrdArrIndTitle)
```

## Notes
- SEC requires a `User-Agent` identifying your requestor. Set it via `SEC_UA`. The script defaults to `your.email@email.com` if you don’t set it.
- The script selects the most recent 10-K/10-Q filing that is flagged as inline XBRL. If none are flagged, it falls back to the most recent filing and scans HTML files for iXBRL tags.
