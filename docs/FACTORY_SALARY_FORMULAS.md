# Factory Salary Calculation Formulas

This document outlines the calculation logic for **Uang Makan** (Meal Allowance) and **Uang Kehadiran** (Attendance Allowance) used in the Factory Monthly Report.

## 1. General Rules
*   **Accumulation**: These components are calculated for the full month (Period 1 + Period 2).
*   **Payment**: Disbursed only in **Period 2**. Period 1 pays only Basic Salary (Gapok) and Overtime.
*   **Base Rate**: Determined by the `Master Gaji` table corresponding to the employee's **Grade**.

---

## 2. Uang Makan (Meal Allowance)

**Formula:**
```
Final Meal Allowance = Base_Meal - (LP_TM_Deduction + Penalty_Deduction)
```

### Components:
1.  **Base_Meal**: The full monthly meal allowance from Master Gaji.
2.  **Daily Rate**: `Base_Meal / 26` (Assumes 26 working days).
3.  **LP_TM_Deduction** (Proportional):
    *   Calculated as: `(Total Days of LP + Total Days of TM) × Daily Rate`
    *   *LP = Libur Perusahaan (Company Holiday)*
    *   *TM = Tanggal Merah (Public Holiday)*
4.  **Penalty_Deduction** (Nominal):
    *   See "Penalty Logic" below.

---

## 3. Uang Kehadiran (Attendance Allowance)

**Formula:**
```
Final Attendance Allowance = Base_Attendance - (LP_TM_Deduction + Penalty_Deduction)
```

### Components:
1.  **Base_Attendance**: The full monthly attendance allowance from Master Gaji.
2.  **Daily Rate**: `Base_Attendance / 26`.
3.  **LP_TM_Deduction** (Proportional):
    *   Calculated as: `(Total Days of LP + Total Days of TM) × Daily Rate`
4.  **Penalty_Deduction** (Nominal):
    *   See "Penalty Logic" below.

---

## 4. Penalty Logic (Potongan/Denda)

Penalties for absence (Sakit, Izin, Alpha) are applied as **fixed nominal amounts**, not based on the daily salary rate.

### A. Sequential / Influential (Berpengaruh - B)
Applies when the status is marked as "Berpengaruh" (e.g., `S_B`, `I_B`, `T_B`). The penalty increases for consecutive days.

*   **Formula**: `10,000 + (n - 1) × 2,000`
    *   **Day 1**: Rp 10,000
    *   **Day 2**: Rp 12,000
    *   **Day 3**: Rp 14,000
    *   *And so on...*

### B. Non-Sequential / Non-Influential (Tidak Berpengaruh - TB)
Applies when the status is marked as "Tidak Berpengaruh" (e.g., `S_TB`, `I_TB`, `T_TB`).

*   **Formula**: Flat **Rp 10,000** per occurrence.

> **Note**: Based on the system logic, these nominal penalties are deducted from **BOTH** *Uang Makan* and *Uang Kehadiran* independently.

---

## 5. Example Calculation

**Scenario:**
*   **Grade**: A
*   **Master Uang Makan**: Rp 500,000 (Daily Rate: ~19,230)
*   **Master Uang Kehadiran**: Rp 300,000 (Daily Rate: ~11,538)
*   **Attendance**: 
    *   1 day **Sakit (B)**
    *   1 day **Libur Perusahaan (LP)**

**Calculation:**

**1. Uang Makan:**
*   Base: 500,000
*   LP Deduction: 1 × 19,230 = 19,230
*   Sakit Penalty: 10,000
*   **Result**: 500,000 - 19,230 - 10,000 = **Rp 470,770**

**2. Uang Kehadiran:**
*   Base: 300,000
*   LP Deduction: 1 × 11,538 = 11,538
*   Sakit Penalty: 10,000
*   **Result**: 300,000 - 11,538 - 10,000 = **Rp 278,462**
