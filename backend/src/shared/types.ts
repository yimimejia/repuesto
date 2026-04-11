export type Rol = 'vendedor' | 'cajero' | 'administrador' | 'al_por_mayor' | 'revendedor' | 'buscador' | 'chofer';

export type EstadoVenta =
  | 'borrador'
  | 'enviada_a_caja'
  | 'en_revision_caja'
  | 'lista_para_cobro'
  | 'cobrada'
  | 'cancelada'
  | 'pendiente_de_cobro'
  | 'en_caja'
  | 'aprobada_a_credito'
  | 'cuenta_por_cobrar'
  | 'parcialmente_pagada'
  | 'pagada_total'
  | 'anulada';
