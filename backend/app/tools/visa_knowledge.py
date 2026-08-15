"""
Mock visa knowledge base.
In production this would call the actual Atlys API.
"""

VISA_DATA = {
    ("india", "france"): {
        "visa_required": True,
        "visa_type": "Schengen Visa (Type C)",
        "processing_time": "15-30 working days",
        "fee": "€80 (~₹7,200)",
        "validity": "Up to 90 days within 180 days",
        "notes": "Biometric appointment required at VFS Global. Book early for peak season (Jun-Aug, Dec).",
        "documents": [
            "Valid passport (6 months validity)",
            "Recent passport-sized photos",
            "Flight itinerary",
            "Hotel bookings",
            "Travel insurance (min €30,000 coverage)",
            "Bank statements (last 3 months)",
            "Proof of employment / leave letter",
            "ITR / salary slips",
        ],
    },
    ("india", "schengen"): {
        "visa_required": True,
        "visa_type": "Schengen Visa (Type C)",
        "processing_time": "15-30 working days",
        "fee": "€80 (~₹7,200)",
        "notes": "Schengen covers 27 European countries. Apply at the embassy of the country you spend most time in.",
    },
    ("india", "uk"): {
        "visa_required": True,
        "visa_type": "UK Standard Visitor Visa",
        "processing_time": "3-6 weeks",
        "fee": "£115 (~₹12,000)",
        "notes": "UK is NOT part of Schengen. Separate visa required.",
    },
    ("india", "uae"): {
        "visa_required": False,
        "notes": "Indians get visa on arrival for 30 days in UAE.",
    },
    ("india", "usa"): {
        "visa_required": True,
        "visa_type": "B1/B2 Tourist Visa",
        "processing_time": "Varies widely (interview wait can be 300+ days)",
        "fee": "$185 (~₹15,500)",
        "notes": "Interview required at US consulate. Apply well in advance.",
    },
}

BUDGET_ESTIMATES = {
    "france": {
        "budget_per_person_per_day_inr": 8000,
        "flight_from_india_inr": 55000,
        "visa_fee_inr": 7200,
        "currency": "EUR",
    },
    "uk": {
        "budget_per_person_per_day_inr": 10000,
        "flight_from_india_inr": 50000,
        "visa_fee_inr": 12000,
        "currency": "GBP",
    },
    "usa": {
        "budget_per_person_per_day_inr": 12000,
        "flight_from_india_inr": 65000,
        "visa_fee_inr": 15500,
        "currency": "USD",
    },
    "uae": {
        "budget_per_person_per_day_inr": 6000,
        "flight_from_india_inr": 20000,
        "visa_fee_inr": 0,
        "currency": "AED",
    },
}


def get_visa_info(passport: str, destination: str) -> dict:
    passport = passport.lower()
    destination = destination.lower()

    # Try exact match first
    key = (passport, destination)
    if key in VISA_DATA:
        return VISA_DATA[key]

    # Try Schengen fallback for European countries
    schengen_countries = [
        "france", "germany", "italy", "spain", "netherlands",
        "portugal", "austria", "switzerland", "greece", "belgium",
        "sweden", "norway", "denmark", "finland", "czech republic",
        "poland", "hungary", "croatia", "slovenia", "slovakia",
    ]
    if passport == "india" and destination in schengen_countries:
        return VISA_DATA.get(("india", "schengen"), {})

    return {
        "visa_required": None,
        "notes": f"Visa information for {passport} passport to {destination} not available. Please check the official embassy website.",
    }


def estimate_budget(destination: str, travelers: int, days: int) -> dict:
    destination = destination.lower()
    data = BUDGET_ESTIMATES.get(destination)
    if not data:
        return {"error": f"Budget estimate not available for {destination}"}

    per_person = data["budget_per_person_per_day_inr"] * days
    total_stay = per_person * travelers
    flights = data["flight_from_india_inr"] * travelers
    visas = data["visa_fee_inr"] * travelers
    total = total_stay + flights + visas

    return {
        "destination": destination,
        "travelers": travelers,
        "days": days,
        "stay_cost_inr": total_stay,
        "flights_inr": flights,
        "visa_fees_inr": visas,
        "total_estimated_inr": total,
        "total_estimated_formatted": f"₹{total:,}",
        "currency": data["currency"],
        "note": "Estimates are approximate. Actual costs may vary.",
    }
