import os

from django.http import JsonResponse
from django.urls import path


def health(_request):
    return JsonResponse({"ok": True})

def structures(_request):
    shared_path = "/shared"

    files = [
        file
        for file in os.listdir(shared_path)
        if file.lower().endswith(".stl")
    ]

    return JsonResponse({"structures": files})

urlpatterns = [
    path("health/", health, name="health"),
    path("structures/", structures, name="structures"),
]
