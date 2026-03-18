import json
import requests
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Optional
import sys

# Compatibilidade com caminhos do Flask
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))
from config import CLIMA_CACHE_FILE, CLIMA_CACHE_TTL_MINUTES

def buscar_coordenadas(cidade: str, estado: str) -> Optional[Dict]:
    """Busca lat/lon usando a geocoding API do Open-Meteo"""
    busca = f"{cidade} {estado}"
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={busca}&count=1&language=pt&format=json"
    try:
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            results = r.json().get('results', [])
            if results:
                best = results[0]
                return {
                    'lat': best.get('latitude'),
                    'lon': best.get('longitude'),
                    'nome': best.get('name', cidade),
                    'estado': best.get('admin1', estado)
                }
    except Exception:
        pass
    return None

def obter_clima(cidade: str = "Vila Velha", estado: str = "ES", lat: float = -20.3297, lon: float = -40.2925, forcar_atualizacao: bool = False) -> Dict:
    cache_cidade = cidade.replace(' ', '_').lower()
    custom_cache_file = Path(CLIMA_CACHE_FILE).parent / f"clima_{cache_cidade}.json"
    
    if not forcar_atualizacao:
        if custom_cache_file.exists():
            with open(custom_cache_file, "r", encoding="utf-8") as f:
                dados_cache = json.load(f)
            atualizado = dados_cache.get("atualizado_em", "")
            if atualizado:
                try:
                    dt_cache = datetime.fromisoformat(atualizado)
                    agora = datetime.now(timezone.utc)
                    if (agora - dt_cache).total_seconds() / 60 <= CLIMA_CACHE_TTL_MINUTES:
                        dados_cache["fonte"] = "cache"
                        return dados_cache
                except Exception:
                    pass

    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
            "hourly": "temperature_2m,precipitation_probability,precipitation,weather_code",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
            "timezone": "America/Sao_Paulo",
            "past_days": 7,
            "forecast_days": 10
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        dados_api = response.json()

        current = dados_api.get("current", {})
        daily = dados_api.get("daily", {})
        hourly = dados_api.get("hourly", {})

        dados_clima = {
            "cidade": f"{cidade}, {estado}",
            "coordenadas": {"lat": lat, "lon": lon},
            "atualizado_em": datetime.now(timezone.utc).isoformat(),
            "atual": {
                "temperatura": current.get("temperature_2m"),
                "sensacao_termica": current.get("apparent_temperature"),
                "umidade": current.get("relative_humidity_2m"),
                "precipitacao": current.get("precipitation"),
                "vento_velocidade": current.get("wind_speed_10m"),
                "vento_direcao": current.get("wind_direction_10m"),
                "codigo_clima": current.get("weather_code"),
                "descricao": _codigo_para_descricao(current.get("weather_code", 0)),
                "icone": _codigo_para_icone(current.get("weather_code", 0), is_day=True),
            },
            "dias": []
        }
        
        # Parse horas para extrair manha/tarde/noite
        # indices por data 'YYYY-MM-DD'
        turnos_por_dia = {}
        if hourly:
            h_time = hourly.get('time', [])
            h_temp = hourly.get('temperature_2m', [])
            h_prec = hourly.get('precipitation', [])
            h_code = hourly.get('weather_code', [])
            
            for i in range(len(h_time)):
                t_str = h_time[i]
                d_str = t_str[:10]
                hour = int(t_str[11:13])
                
                if d_str not in turnos_por_dia:
                    turnos_por_dia[d_str] = {'horas': [], 'temps': [], 'precips': [], 'codes': []}
                
                turnos_por_dia[d_str]['horas'].append(hour)
                turnos_por_dia[d_str]['temps'].append(h_temp[i])
                turnos_por_dia[d_str]['precips'].append(h_prec[i])
                turnos_por_dia[d_str]['codes'].append(h_code[i])

        def get_closest_turno(t_dict, target_hour, fallback_temp, is_day):
            horas = t_dict.get('horas', [])
            if not horas:
                return {'temp': fallback_temp, 'icone': _codigo_para_icone(0, is_day), 'chuva': 0.0, 'desc': 'Previsão gerada autom.'}
            best_idx = min(range(len(horas)), key=lambda i: abs(horas[i] - target_hour))
            h_c = t_dict['codes'][best_idx]
            return {
                'temp': t_dict['temps'][best_idx],
                'icone': _codigo_para_icone(h_c, is_day),
                'chuva': t_dict['precips'][best_idx],
                'desc': _codigo_para_descricao(h_c)
            }

        if daily:
            datas = daily.get("time", [])
            maximas = daily.get("temperature_2m_max", [])
            minimas = daily.get("temperature_2m_min", [])
            precipitacoes = daily.get("precipitation_sum", [])
            codigos = daily.get("weather_code", [])
            probs = daily.get("precipitation_probability_max", [])

            for i in range(len(datas)):
                d_str = datas[i]
                turno = turnos_por_dia.get(d_str, {})
                
                # Extrai dados reais se existirem, aproximando o horario
                manha = get_closest_turno(turno, 8, minimas[i] if i < len(minimas) else 20, True)
                tarde = get_closest_turno(turno, 14, maximas[i] if i < len(maximas) else 30, True)
                noite = get_closest_turno(turno, 20, minimas[i] if i < len(minimas) else 20, False)
                
                dados_clima["dias"].append({
                    "data": d_str,
                    "temp_max": maximas[i] if i < len(maximas) else None,
                    "temp_min": minimas[i] if i < len(minimas) else None,
                    "precipitacao": precipitacoes[i] if i < len(precipitacoes) else 0.0,
                    "prob_chuva": probs[i] if i < len(probs) else 0,
                    "descricao": _codigo_para_descricao(codigos[i] if i < len(codigos) else 0),
                    "icone": _codigo_para_icone(codigos[i] if i < len(codigos) else 0, is_day=True),
                    "manha": manha,
                    "tarde": tarde,
                    "noite": noite,
                    "tendencia_temps": turno.get('temps', [])
                })

        # Remove dados brutos muito grandes após uso (opcional, p/ limpar json no cache)
        # Salva o resultado consolidado
        Path(custom_cache_file).parent.mkdir(parents=True, exist_ok=True)
        with open(custom_cache_file, "w", encoding="utf-8") as f:
            json.dump(dados_clima, f, ensure_ascii=False, indent=2)
            
        dados_clima["fonte"] = "api"
        return dados_clima

    except Exception as e:
        return {
            "cidade": f"{cidade}, {estado}",
            "erro": f"Erro Open-Meteo: {str(e)}",
            "fonte": "indisponivel",
            "atual": {"temperatura": "--", "icone": "❓", "descricao": "Indisponível"}
        }

def _codigo_para_descricao(codigo: int) -> str:
    descricoes = {
        0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Garoa leve", 53: "Garoa moderada",
        55: "Garoa intensa", 61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
        71: "Neve leve", 73: "Neve moderada", 75: "Neve forte",
        80: "Pancadas leves", 81: "Pancadas moderadas", 82: "Pancadas fortes",
        95: "Tempestade", 96: "Tempestade leve", 99: "Tempestade forte"
    }
    return descricoes.get(codigo, "Indeterminado")

def _codigo_para_icone(codigo: int, is_day: bool = True) -> str:
    if not is_day and codigo in [0, 1]:
        return "🌙"
    if not is_day and codigo == 2:
        return "☁️"
    icones = {
        0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
        45: "🌫️", 48: "🌫️",
        51: "🌦️", 53: "🌦️", 55: "🌧️",
        61: "🌧️", 63: "🌧️", 65: "🌧️",
        71: "❄️", 73: "❄️", 75: "❄️",
        80: "🌦️", 81: "🌧️", 82: "⛈️",
        95: "⛈️", 96: "⛈️", 99: "⛈️"
    }
    return icones.get(codigo, "🌡️")
