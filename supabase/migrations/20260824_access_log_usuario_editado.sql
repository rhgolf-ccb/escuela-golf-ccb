-- Editar una cuenta desde /accesos (cambiarle el rol o los alumnos vinculados)
-- es un movimiento de acceso como los demás y tiene que quedar en el registro.
-- `access_logs.accion` es el enum app_accion, así que sin este valor el insert
-- del endpoint /api/update-user falla y el cambio queda sin rastro de quién lo
-- hizo — justo lo que el registro existe para evitar.
alter type app_accion add value if not exists 'usuario_editado';
